#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# File: api.py
# Author: Wadih Khairallah
# Description: RESTful API interface for the Interactor class
#              Exposes AI interaction functionality for web applications
# Created: 2025-04-07 10:00:00
# Modified: 2025-04-17 21:13:13

import os
import json
from typing import Dict, Any, Optional, List, Union
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
from queue import Queue, Empty
import threading
import time
from werkzeug.utils import secure_filename

from .interactor import Interactor
from .textextract import extract_text
from .tools import (
        search_google,
        get_weather,
        get_website
    )
from .transcripts import TranscriptManager

app = Flask(__name__)

# Configure CORS with more specific settings
CORS(app, 
     resources={r"/api/*": {"origins": ["http://localhost:8000", "http://127.0.0.1:8000"]}},
     supports_credentials=True,
     allow_headers=["Content-Type", "Authorization", "Accept"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])

# Global interactor instance
interactor = None

# Initialize transcript manager
transcript_manager = None

# Configure upload settings
UPLOAD_FOLDER = os.path.join('frontend', 'user_data')
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'doc', 'docx'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_interactor() -> Interactor:
    """Get or initialize the global interactor instance.
    
    Returns:
        Interactor: The global interactor instance
    """
    global interactor
    if interactor is None:
        interactor = Interactor(stream=True, tools=True)
        interactor.add_function(search_google, name="search_google", description="Search the web for information")  
        interactor.add_function(get_weather, name="get_weather", description="Get the weather for a specific location")
        interactor.add_function(get_website, name="get_website", description="Get the content of a specific website")
    return interactor

def get_transcript_manager() -> TranscriptManager:
    """Get or initialize the global transcript manager instance.
    
    Returns:
        TranscriptManager: The global transcript manager instance
    """
    global transcript_manager
    if transcript_manager is None:
        transcript_manager = TranscriptManager()
    return transcript_manager

@app.route('/api/interact', methods=['POST'])
def api_interact():
    """Interact with the AI model and get a response.
    
    Request JSON parameters:
        message (str): The user message to send to the AI
        attachments (list, optional): List of attachment strings to include with the message
        stream (bool, optional): Whether to stream the response
        tools (bool, optional): Whether to allow tool usage
        transcript_id (str, optional): ID of the transcript to load
        
    Returns:
        Response containing the AI's response, either streamed or complete
    """
    ai = get_interactor()
    
    data = request.json
    user_input = data.get('message', '')
    attachments = data.get('attachments', [])
    stream = data.get('stream', False)
    enable_tools = data.get('tools', True)
    transcript_id = data.get('transcript_id', None)
    
    # Combine message with any attachments
    if attachments:
        combined_input = user_input + "\n\n" + "\n\n".join(attachments)
    else:
        combined_input = user_input
    
    # If a transcript ID is provided but not loaded in the interactor,
    # try to load it now to ensure continuity
    if transcript_id:
        try:
            # Check if the interactor already has a conversation history for this transcript
            # If not, load it from the database
            message_count = len(ai.messages_get())
            if message_count <= 1:  # Only system message or empty
                manager = get_transcript_manager()
                transcript = manager.get_transcript(transcript_id)
                
                if transcript:
                    # Don't call the endpoint directly to avoid cycling references
                    # Instead, just update the interactor's message history
                    ai.messages_flush()  # Clear existing messages but keep system prompt
                    
                    # Add each message from the transcript to the interactor
                    for message in transcript['messages']:
                        if message['role'] != 'system':  # Skip system messages
                            # Handle different message formats
                            if message.get('tool_calls'):
                                # Assistant message with tool calls
                                ai.history.append({
                                    'role': message['role'],
                                    'content': message.get('content'),
                                    'tool_calls': message['tool_calls']
                                })
                            elif message.get('tool_call_id'):
                                # Tool response message
                                ai.history.append({
                                    'role': 'tool',
                                    'content': message['content'],
                                    'tool_call_id': message['tool_call_id']
                                })
                            else:
                                # Regular user or assistant message
                                ai.messages_add(message['role'], message['content'])
                    
                    print(f"Loaded transcript {transcript_id} with {len(transcript['messages'])} messages")
        except Exception as e:
            print(f"Warning: Failed to load transcript {transcript_id}: {str(e)}")
    
    # Capture the response timestamp for storing with the message
    response_timestamp = int(time.time() * 1000)
    
    if stream:
        def generate():
            q = Queue()
            tool_results = []  # Track tool results
            
            def stream_callback(token):
                try:
                    # Check if this is a tool call notification
                    if token.startswith('{"type":"tool_call"') or token.startswith('{"type": "tool_call"'):
                        notification = json.loads(token)
                        # If it's a completed tool call with results, store the result
                        if notification.get("status") == "completed" and "tool_result" in notification:
                            tool_results.append({
                                "tool_name": notification.get("tool_name"),
                                "result": notification.get("tool_result")
                            })
                            # Don't send raw JSON notifications to the client
                            return
                except:
                    pass  # If it's not valid JSON or doesn't have the expected structure, treat as normal token
                
                q.put(token)
            
            def generate_response():
                try:
                    ai.interact(
                        combined_input, 
                        output_callback=stream_callback, 
                        stream=True, 
                        tools=enable_tools,
                    )
                    
                    # After interaction is complete, append tool results if any
                    if tool_results:
                        q.put("\n\n")  # Add spacing
                        for result in tool_results:
                            tool_name = result.get("tool_name", "Unknown Tool")
                            result_data = result.get("result", {})
                            q.put(f"Tool Results from {tool_name}:\n")
                            q.put(json.dumps(result_data, indent=2))
                            q.put("\n\n")
                finally:
                    q.put(None)  # Signal end of stream
            
            threading.Thread(target=generate_response, daemon=True).start()
            
            while True:
                try:
                    token = q.get(timeout=0.25)
                    if token is None:
                        break
                    yield token
                except Empty:
                    continue
        
        return Response(stream_with_context(generate()), content_type="text/plain")
    else:
        try:
            # Track tool results
            collected_tool_results = []
            
            def collect_tool_results(token):
                try:
                    # Check if this is a tool call notification
                    if token.startswith('{"type":"tool_call"') or token.startswith('{"type": "tool_call"'):
                        notification = json.loads(token)
                        # If it's a completed tool call with results, store the result
                        if notification.get("status") == "completed" and "tool_result" in notification:
                            collected_tool_results.append({
                                "tool_name": notification.get("tool_name"),
                                "result": notification.get("tool_result")
                            })
                except:
                    pass  # If it's not valid JSON or doesn't have the expected structure, ignore
            
            response = ai.interact(
                combined_input, 
                quiet=True,
                tools=enable_tools,
                stream=False,
                output_callback=collect_tool_results  # Add callback to collect tool results
            )
            
            # Append tool results to the response text
            if collected_tool_results:
                response += "\n\n"  # Add spacing
                for result in collected_tool_results:
                    tool_name = result.get("tool_name", "Unknown Tool")
                    result_data = result.get("result", {})
                    response += f"Tool Results from {tool_name}:\n"
                    response += json.dumps(result_data, indent=2)
                    response += "\n\n"
            
            # Add tool calls to history
            ai = get_interactor()
            messages = ai.messages_get()
            
            print(f"Extracting tool calls from conversation history ({len(messages)} messages)")
            
            # Extract tool calls and their results from the history
            tool_data = []
            for i, msg in enumerate(messages):
                if msg["role"] == "assistant" and msg.get("tool_calls"):
                    print(f"Found assistant message with tool calls: {msg.get('tool_calls')}")
                    tool_call_ids = [tc["id"] for tc in msg["tool_calls"]]
                    
                    # Find corresponding tool results for these tool calls
                    message_results = []
                    for tc_id in tool_call_ids:
                        print(f"Looking for result of tool call {tc_id}")
                        for tool_msg in messages:
                            if tool_msg["role"] == "tool" and tool_msg.get("tool_call_id") == tc_id:
                                print(f"Found tool result for {tc_id}")
                                # Find which tool call this result belongs to
                                for tc in msg["tool_calls"]:
                                    if tc["id"] == tc_id:
                                        tool_name = tc["function"]["name"]
                                        tool_args = tc["function"]["arguments"]
                                        
                                        # Get the result content and sanitize it
                                        try:
                                            result = json.loads(tool_msg["content"])
                                            message_results.append({
                                                "tool_name": tool_name,
                                                "tool_arguments": tool_args,
                                                "tool_result": result
                                            })
                                            print(f"Added result for tool {tool_name}")
                                        except:
                                            # Fallback if parsing fails
                                            print(f"Failed to parse tool result for {tool_name}")
                                            message_results.append({
                                                "tool_name": tool_name,
                                                "tool_arguments": tool_args,
                                                "tool_result": {"error": "Failed to parse tool result"}
                                            })
                    
                    if message_results:
                        # Collect all results instead of replacing them
                        tool_data.extend(message_results)
                        print(f"Collected {len(message_results)} tool results, total: {len(tool_data)}")
            
            # If transcript_id exists, save the response to the transcript
            if transcript_id:
                try:
                    manager = get_transcript_manager()
                    transcript = manager.get_transcript(transcript_id)
                    
                    if transcript:
                        # Add the new messages to the transcript
                        messages = transcript['messages']
                        
                        # Add user message
                        messages.append({
                            "role": "user",
                            "content": combined_input,
                            "timestamp": int(time.time() * 1000)
                        })
                        
                        # Add assistant response with tool data if available
                        assistant_message = {
                            "role": "assistant",
                            "content": response,
                            "timestamp": response_timestamp
                        }
                        
                        # Add tool_data if we have any
                        if tool_data:
                            print(f"Adding {len(tool_data)} tool results to assistant message")
                            assistant_message["tool_data"] = tool_data
                            
                            # Also ensure the formatted tool results are in the content
                            # This ensures the transcript displays tool results consistently
                            if not response.endswith("\n\n") and tool_data:
                                assistant_message["content"] += "\n\n"
                                
                            for result in tool_data:
                                tool_name = result.get("tool_name", "Unknown Tool")
                                result_data = result.get("tool_result", {})
                                if result_data:
                                    assistant_message["content"] += f"Tool Results from {tool_name}:\n"
                                    assistant_message["content"] += json.dumps(result_data, indent=2)
                                    assistant_message["content"] += "\n\n"
                        
                        messages.append(assistant_message)
                        print(f"Saving updated transcript with {len(messages)} messages")
                        
                        # Update the transcript with the new messages
                        manager.update_transcript(transcript_id, {"messages": messages})
                except Exception as e:
                    print(f"Warning: Failed to save message to transcript {transcript_id}: {str(e)}")
            
            return jsonify({"response": response})
        except Exception as e:
            return jsonify({"error": str(e)}), 500


@app.route('/api/models', methods=['GET'])
def list_models():
    """List available AI models.
    
    Query parameters:
        provider (str, optional): Filter models by provider
        filter (str, optional): Regex pattern to filter model names
    
    Returns:
        JSON response with list of available models
    """
    provider = request.args.get('provider')
    filter_pattern = request.args.get('filter')
    
    ai = get_interactor()
    models = ai.list(providers=provider, filter=filter_pattern)
    
    return jsonify({"models": models})


@app.route('/api/add_function', methods=['POST'])
def add_function():
    """Register a function for tool calling.
    
    Request JSON parameters:
        module_path (str): Path to the Python module containing the function
        function_name (str): Name of the function to register
        custom_name (str, optional): Custom name for the function
        description (str, optional): Custom description for the function
    
    Returns:
        JSON response indicating success or failure
    """
    data = request.json
    module_path = data.get('module_path')
    function_name = data.get('function_name')
    custom_name = data.get('custom_name')
    description = data.get('description')
    
    if not module_path or not function_name:
        return jsonify({"error": "Module path and function name are required"}), 400
    
    try:
        # Import the module dynamically
        import importlib.util
        spec = importlib.util.spec_from_file_location("module", module_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        
        # Get the function from the module
        func = getattr(module, function_name)
        
        # Register the function with the interactor
        ai = get_interactor()
        ai.add_function(func, name=custom_name, description=description)
        
        return jsonify({"success": True, "message": f"Function {function_name} registered successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/functions', methods=['GET'])
def get_functions():
    """Get the list of registered functions for tool calling.
    
    Returns:
        JSON response with list of registered functions
    """
    ai = get_interactor()
    functions = ai.get_functions()
    
    return jsonify({"functions": functions})


@app.route('/api/system_prompt', methods=['POST'])
def set_system_prompt():
    """Set the system prompt for the conversation.
    
    Request JSON parameters:
        prompt (str): The system prompt to set
    
    Returns:
        JSON response with the updated system prompt
    """
    data = request.json
    prompt = data.get('prompt')
    
    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400
    
    ai = get_interactor()
    system_prompt = ai.messages_system(prompt)
    
    return jsonify({"system_prompt": system_prompt})


@app.route('/api/messages', methods=['GET'])
def get_messages():
    """Get the current conversation history.
    
    Returns:
        JSON response with the conversation history
    """
    ai = get_interactor()
    messages = ai.messages_get()
    
    return jsonify({"messages": messages})


@app.route('/api/messages', methods=['DELETE'])
def clear_messages():
    """Clear the conversation history while preserving the system prompt.
    
    Returns:
        JSON response indicating success
    """
    ai = get_interactor()
    ai.messages_flush()
    
    return jsonify({"success": True, "message": "Conversation history cleared"})


@app.route('/api/messages', methods=['POST'])
def add_message():
    """Add a message to the conversation history.
    
    Request JSON parameters:
        role (str): The role of the message (e.g., 'user', 'system', 'assistant')
        content (str): The content of the message
    
    Returns:
        JSON response with the updated conversation history
    """
    data = request.json
    role = data.get('role')
    content = data.get('content')
    
    if not role or not content:
        return jsonify({"error": "Role and content are required"}), 400
    
    # Add timestamp to the message for storage, but not for the interactor
    timestamp = data.get('timestamp') or int(time.time() * 1000)  # Use provided timestamp or current time in milliseconds
    
    # Add the message to the interactor without timestamp
    ai = get_interactor()
    messages = ai.messages_add(role, content)  # The interactor doesn't store our timestamp
    
    # Return the messages with timestamps added
    messages_with_timestamps = []
    for msg in messages:
        msg_copy = msg.copy()  # Create a copy to avoid modifying the original
        
        # Use existing timestamp if this message is the one we just added
        if msg['role'] == role and msg['content'] == content:
            msg_copy['timestamp'] = timestamp
        # Otherwise, use a default timestamp if none exists
        elif 'timestamp' not in msg_copy:
            msg_copy['timestamp'] = int(time.time() * 1000)
            
        messages_with_timestamps.append(msg_copy)
    
    return jsonify({"messages": messages_with_timestamps})


@app.route('/api/model', methods=['GET'])
def get_model():
    """Get the currently configured model.
    
    Returns:
        JSON response with the current model information
    """
    ai = get_interactor()
    
    return jsonify({
        "provider": ai.provider,
        "model": ai.model,
        "full_model": f"{ai.provider}:{ai.model}",
        "tools_supported": ai.tools_supported
    })


@app.route('/api/settings', methods=['GET'])
def get_settings():
    """Get the current settings for the Interactor class.
    
    Returns:
        JSON response with all configuration options except API keys
    """
    ai = get_interactor()
    
    settings = {
        "model": ai.model,
        "provider": ai.provider,
        "stream": ai.stream,
        "tools_enabled": ai.tools_enabled,
        "tools_supported": ai.tools_supported,
        "context_length": ai.context_length,
        "system_prompt": ai.system,
        "message_count": len(ai.history),
        "token_count": ai.messages_length()
    }
    
    # Include base URLs for providers but exclude API keys for security
    provider_configs = {}
    for provider, config in ai.providers.items():
        provider_configs[provider] = {
            "base_url": config["base_url"]
        }
    
    settings["providers"] = provider_configs
    
    return jsonify(settings)


@app.route('/api/switch_model', methods=['POST'])
def switch_model():
    """Switch to a different AI model.
    
    Request JSON parameters:
        model (str): Model identifier in format "provider:model_name"
        base_url (str, optional): Base URL for the API
        api_key (str, optional): API key for the provider
    
    Returns:
        JSON response indicating success or failure
    """
    data = request.json
    model = data.get('model')
    base_url = data.get('base_url')
    api_key = data.get('api_key')
    
    if not model:
        return jsonify({"error": "Model identifier is required"}), 400
    
    try:
        ai = get_interactor()
        ai._setup_client(model, base_url, api_key)
        ai._setup_encoding()
        
        return jsonify({
            "success": True, 
            "message": f"Switched to model {model}",
            "provider": ai.provider,
            "model": ai.model,
            "tools_supported": ai.tools_supported
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/context_length', methods=['GET'])
def get_context_length():
    """Get the currently configured maximum context length.
    
    Returns:
        JSON response with the current context length
    """
    ai = get_interactor()
    
    return jsonify({
        "context_length": ai.context_length
    })


@app.route('/api/context_length', methods=['POST'])
def set_context_length():
    """Set the maximum context length for the conversation.
    
    Request JSON parameters:
        context_length (int): The maximum context length in tokens
    
    Returns:
        JSON response with the updated context length
    """
    data = request.json
    context_length = data.get('context_length')
    
    if not context_length or not isinstance(context_length, int) or context_length <= 0:
        return jsonify({"error": "Valid context length (positive integer) is required"}), 400
    
    try:
        ai = get_interactor()
        ai.context_length = context_length
        
        return jsonify({
            "success": True,
            "message": f"Context length updated to {context_length} tokens",
            "context_length": ai.context_length
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/files/upload', methods=['POST'])
def upload_file():
    """Handle file uploads and extract text content.
    Files are stored in the frontend/user_data directory for future reference.
    
    Returns:
        JSON response with upload status, file information, and extracted text
    """
    # Check if a file was uploaded
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    
    # Check if a file was selected
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    try:
        # Secure the filename and save the file
        filename = secure_filename(file.filename)
        
        # Create uploads directory if it doesn't exist
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        
        # Save the file to the user_data directory
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)
        
        # Try to extract text from the file
        try:
            extracted_text = extract_text(file_path)
            if not extracted_text:
                extracted_text = None
        except Exception as e:
            extracted_text = None
        
        # Return success response with file info
        response = {
            "message": "File processed and stored successfully",
            "filename": filename,
            "path": file_path,
            "stored_location": "frontend/user_data"
        }
        
        # Only include extracted_text if it was successfully extracted
        if extracted_text is not None:
            response["extracted_text"] = extracted_text
        
        return jsonify(response)
        
    except Exception as e:
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500


@app.route('/api/files', methods=['GET'])
def list_files():
    """List all files in the user_data directory.
    
    Returns:
        JSON response with list of files and their metadata
    """
    try:
        files = []
        for filename in os.listdir(app.config['UPLOAD_FOLDER']):
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            if os.path.isfile(file_path):
                files.append({
                    "filename": filename,
                    "path": file_path,
                    "size": os.path.getsize(file_path),
                    "modified": os.path.getmtime(file_path)
                })
        return jsonify({"files": files})
    except Exception as e:
        return jsonify({"error": f"Failed to list files: {str(e)}"}), 500


@app.route('/api/files/delete', methods=['POST', 'OPTIONS'])
def delete_user_file():
    """Delete a file or directory from the user_data directory.
    
    Request JSON parameters:
        path (str): Relative path to the file/directory within user_data
        is_directory (bool, optional): Whether the path is a directory (default: False)
    
    Returns:
        JSON response indicating success or failure
    """
    if request.method == 'OPTIONS':
        return '', 200
    
    data = request.json
    relative_path = data.get('path')
    is_directory = data.get('is_directory', False)
    
    if not relative_path:
        return jsonify({"error": "Path is required"}), 400
    
    try:
        # Ensure the path is within user_data directory
        full_path = os.path.abspath(os.path.join(app.config['UPLOAD_FOLDER'], relative_path))
        if not full_path.startswith(os.path.abspath(app.config['UPLOAD_FOLDER'])):
            return jsonify({"error": "Invalid path: Must be within user_data directory"}), 403
        
        if not os.path.exists(full_path):
            return jsonify({"error": "Path does not exist"}), 404
        
        if is_directory:
            if os.path.isdir(full_path):
                import shutil
                shutil.rmtree(full_path)
            else:
                return jsonify({"error": "Specified path is not a directory"}), 400
        else:
            if os.path.isfile(full_path):
                os.remove(full_path)
            else:
                return jsonify({"error": "Specified path is not a file"}), 400
        
        return jsonify({
            "success": True,
            "message": f"{'Directory' if is_directory else 'File'} deleted successfully"
        })
        
    except Exception as e:
        return jsonify({"error": f"Delete failed: {str(e)}"}), 500


@app.route('/api/files/create_directory', methods=['POST'])
def create_user_directory():
    """Create a new directory in the user_data directory.
    
    Request JSON parameters:
        path (str): Relative path for the new directory within user_data
    
    Returns:
        JSON response indicating success or failure
    """
    data = request.json
    relative_path = data.get('path')
    
    if not relative_path:
        return jsonify({"error": "Path is required"}), 400
    
    try:
        # Ensure the path is within user_data directory
        full_path = os.path.abspath(os.path.join(app.config['UPLOAD_FOLDER'], relative_path))
        if not full_path.startswith(os.path.abspath(app.config['UPLOAD_FOLDER'])):
            return jsonify({"error": "Invalid path: Must be within user_data directory"}), 403
        
        os.makedirs(full_path, exist_ok=True)
        
        return jsonify({
            "success": True,
            "message": "Directory created successfully",
            "path": relative_path
        })
        
    except Exception as e:
        return jsonify({"error": f"Directory creation failed: {str(e)}"}), 500


@app.route('/api/files/move', methods=['POST'])
def move_user_file():
    """Move a file or directory within the user_data directory.
    
    Request JSON parameters:
        source (str): Relative path of the source file/directory within user_data
        destination (str): Relative path of the destination within user_data
    
    Returns:
        JSON response indicating success or failure
    """
    data = request.json
    source = data.get('source')
    destination = data.get('destination')
    
    if not source or not destination:
        return jsonify({"error": "Source and destination paths are required"}), 400
    
    try:
        # Ensure both paths are within user_data directory
        full_source = os.path.abspath(os.path.join(app.config['UPLOAD_FOLDER'], source))
        full_dest = os.path.abspath(os.path.join(app.config['UPLOAD_FOLDER'], destination))
        
        if not (full_source.startswith(os.path.abspath(app.config['UPLOAD_FOLDER'])) and 
                full_dest.startswith(os.path.abspath(app.config['UPLOAD_FOLDER']))):
            return jsonify({"error": "Invalid path: Must be within user_data directory"}), 403
        
        if not os.path.exists(full_source):
            return jsonify({"error": "Source path does not exist"}), 404
        
        # If destination is a directory, append the source filename
        if os.path.isdir(full_dest):
            full_dest = os.path.join(full_dest, os.path.basename(full_source))
        # If destination is the root directory (user_data), use the source filename
        elif destination == 'user_data':
            full_dest = os.path.join(app.config['UPLOAD_FOLDER'], os.path.basename(full_source))
        
        # Create destination directory if it doesn't exist
        os.makedirs(os.path.dirname(full_dest), exist_ok=True)
        
        # Move the file or directory
        import shutil
        shutil.move(full_source, full_dest)
        
        return jsonify({
            "success": True,
            "message": "File/directory moved successfully",
            "source": source,
            "destination": destination
        })
        
    except Exception as e:
        return jsonify({"error": f"Move operation failed: {str(e)}"}), 500


@app.route('/api/files/tree', methods=['GET'])
def get_files_tree():
    """Get a tree structure of all files and directories in the user_data directory.
    
    Returns:
        JSON response with the directory tree structure
    """
    def build_tree(path):
        tree = []
        try:
            for entry in os.scandir(path):
                item = {
                    "name": entry.name,
                    "path": os.path.relpath(entry.path, app.config['UPLOAD_FOLDER']),
                    "type": "directory" if entry.is_dir() else "file"
                }
                
                if entry.is_file():
                    item["size"] = entry.stat().st_size
                    item["modified"] = entry.stat().st_mtime
                elif entry.is_dir():
                    item["children"] = build_tree(entry.path)
                
                tree.append(item)
        except Exception as e:
            print(f"Error scanning directory {path}: {e}")
        
        return sorted(tree, key=lambda x: (x["type"] == "file", x["name"].lower()))
    
    try:
        tree = build_tree(app.config['UPLOAD_FOLDER'])
        return jsonify({
            "tree": tree,
            "root": "user_data"
        })
    except Exception as e:
        return jsonify({"error": f"Failed to get directory tree: {str(e)}"}), 500


@app.route('/api/files/info', methods=['GET'])
def get_file_info():
    """Get detailed information and preview of a file or directory.
    
    Query parameters:
        path (str): Relative path to the file/directory within user_data
    
    Returns:
        JSON response with file/directory metadata and contents
    """
    relative_path = request.args.get('path')
    
    if not relative_path:
        return jsonify({"error": "Path is required"}), 400
    
    try:
        # Ensure the path is within user_data directory
        full_path = os.path.abspath(os.path.join(app.config['UPLOAD_FOLDER'], relative_path))
        if not full_path.startswith(os.path.abspath(app.config['UPLOAD_FOLDER'])):
            return jsonify({"error": "Invalid path: Must be within user_data directory"}), 403
        
        if not os.path.exists(full_path):
            return jsonify({"error": "Path does not exist"}), 404
        
        # Get basic metadata
        stat = os.stat(full_path)
        info = {
            "name": os.path.basename(full_path),
            "path": relative_path,
            "size": stat.st_size,
            "created": stat.st_ctime,
            "modified": stat.st_mtime,
            "accessed": stat.st_atime,
            "is_readable": os.access(full_path, os.R_OK),
            "is_writable": os.access(full_path, os.W_OK),
            "is_executable": os.access(full_path, os.X_OK),
            "type": "directory" if os.path.isdir(full_path) else "file"
        }
        
        # Handle directory contents
        if os.path.isdir(full_path):
            contents = []
            for entry in os.scandir(full_path):
                entry_stat = entry.stat()
                contents.append({
                    "name": entry.name,
                    "path": os.path.join(relative_path, entry.name),
                    "type": "directory" if entry.is_dir() else "file",
                    "size": entry_stat.st_size,
                    "modified": entry_stat.st_mtime
                })
            info["contents"] = sorted(contents, key=lambda x: (x["type"] == "file", x["name"].lower()))
        else:
            # Handle file preview
            import mimetypes
            mime_type, _ = mimetypes.guess_type(full_path)
            info["mime_type"] = mime_type
            
            if mime_type and mime_type.startswith('image/'):
                info["preview"] = relative_path
                info["preview_type"] = "image"
            else:
                try:
                    with open(full_path, 'r', encoding='utf-8') as f:
                        info["preview"] = f.read()
                        info["preview_type"] = "text"
                except UnicodeDecodeError:
                    try:
                        extracted_text = extract_text(full_path)
                        if extracted_text:
                            info["preview"] = extracted_text
                            info["preview_type"] = "text"
                    except Exception:
                        info["preview_type"] = "none"
        
        return jsonify(info)
        
    except Exception as e:
        return jsonify({"error": f"Failed to get info: {str(e)}"}), 500


@app.route('/api/files/search', methods=['GET'])
def search_files():
    """Search for files and directories in the user_data directory.
    
    Query parameters:
        query (str): Search query (supports wildcards)
        type (str, optional): Filter by type ('file' or 'directory')
        recursive (bool, optional): Whether to search recursively (default: True)
    
    Returns:
        JSON response with search results
    """
    query = request.args.get('query')
    file_type = request.args.get('type')
    recursive = request.args.get('recursive', 'true').lower() == 'true'
    
    if not query:
        return jsonify({"error": "Search query is required"}), 400
    
    try:
        results = []
        import fnmatch
        
        def should_include(entry):
            if file_type == 'file' and not entry.is_file():
                return False
            if file_type == 'directory' and not entry.is_dir():
                return False
            return fnmatch.fnmatch(entry.name.lower(), query.lower())
        
        def scan_directory(path):
            try:
                with os.scandir(path) as entries:
                    for entry in entries:
                        if should_include(entry):
                            results.append({
                                "name": entry.name,
                                "path": os.path.relpath(entry.path, app.config['UPLOAD_FOLDER']),
                                "type": "directory" if entry.is_dir() else "file",
                                "size": entry.stat().st_size if entry.is_file() else None,
                                "modified": entry.stat().st_mtime
                            })
                        if recursive and entry.is_dir():
                            scan_directory(entry.path)
            except Exception as e:
                print(f"Error scanning directory {path}: {e}")
        
        scan_directory(app.config['UPLOAD_FOLDER'])
        
        return jsonify({
            "query": query,
            "type": file_type,
            "recursive": recursive,
            "results": results
        })
        
    except Exception as e:
        return jsonify({"error": f"Search failed: {str(e)}"}), 500


@app.route('/api/files/copy', methods=['POST'])
def copy_user_file():
    """Copy a file or directory within the user_data directory.
    
    Request JSON parameters:
        source (str): Relative path of the source file/directory within user_data
        destination (str): Relative path of the destination within user_data
        is_directory (bool): Whether the source is a directory
    
    Returns:
        JSON response indicating success or failure
    """
    data = request.json
    source = data.get('source')
    destination = data.get('destination')
    is_directory = data.get('is_directory', False)
    
    if not source or not destination:
        return jsonify({"error": "Source and destination paths are required"}), 400
    
    try:
        # Ensure both paths are within user_data directory
        full_source = os.path.abspath(os.path.join(app.config['UPLOAD_FOLDER'], source))
        full_dest = os.path.abspath(os.path.join(app.config['UPLOAD_FOLDER'], destination))
        
        if not (full_source.startswith(os.path.abspath(app.config['UPLOAD_FOLDER'])) and 
                full_dest.startswith(os.path.abspath(app.config['UPLOAD_FOLDER']))):
            return jsonify({"error": "Invalid path: Must be within user_data directory"}), 403
        
        if not os.path.exists(full_source):
            return jsonify({"error": "Source path does not exist"}), 404
        
        # Create destination directory if it doesn't exist
        os.makedirs(os.path.dirname(full_dest), exist_ok=True)
        
        # Copy the file or directory
        import shutil
        if is_directory:
            shutil.copytree(full_source, full_dest)
        else:
            shutil.copy2(full_source, full_dest)
        
        return jsonify({
            "success": True,
            "message": "File/directory copied successfully",
            "source": source,
            "destination": destination
        })
        
    except Exception as e:
        return jsonify({"error": f"Copy operation failed: {str(e)}"}), 500


@app.route('/api/reset', methods=['POST'])
def reset_interactor():
    """Reset the Interactor class with optional new settings.
    
    Request JSON parameters:
        model (str, optional): Model identifier in format "provider:model_name"
        base_url (str, optional): Base URL for the API
        api_key (str, optional): API key for the provider
        context_length (int, optional): New context length in tokens
    
    Returns:
        JSON response indicating success and new settings
    """
    data = request.json
    model = data.get('model')
    base_url = data.get('base_url')
    api_key = data.get('api_key')
    context_length = data.get('context_length')
    
    global interactor
    
    # Close existing interactor if it exists
    if interactor is not None:
        try:
            interactor.close()
        except Exception as e:
            print(f"Warning: Error closing existing interactor: {e}")
    
    # Reset to None to force new creation
    interactor = None
    
    # Get new interactor instance
    ai = get_interactor()
    
    # Apply new settings if provided
    if model or base_url or api_key:
        try:
            ai._setup_client(model, base_url, api_key)
            ai._setup_encoding()
        except Exception as e:
            return jsonify({"error": f"Failed to apply new settings: {str(e)}"}), 500
    
    if context_length is not None:
        try:
            ai.context_length = context_length
        except Exception as e:
            return jsonify({"error": f"Failed to set context length: {str(e)}"}), 500
    
    return jsonify({
        "success": True,
        "message": "Interactor reset successfully",
        "settings": {
            "provider": ai.provider,
            "model": ai.model,
            "context_length": ai.context_length,
            "tools_supported": ai.tools_supported
        }
    })


@app.route('/api/transcripts', methods=['GET'])
def get_transcripts():
    """Get all transcripts.
    
    Query parameters:
        search (str, optional): Search query to filter transcripts
    
    Returns:
        JSON response with list of transcripts
    """
    search_query = request.args.get('search', '')
    
    manager = get_transcript_manager()
    
    if search_query:
        transcripts = manager.search_transcripts(search_query)
    else:
        transcripts = manager.get_all_transcripts()
    
    return jsonify({"transcripts": transcripts})


@app.route('/api/transcripts/<transcript_id>', methods=['GET'])
def get_transcript(transcript_id):
    """Get a specific transcript by ID.
    
    Returns:
        JSON response with the transcript data
    """
    manager = get_transcript_manager()
    transcript = manager.get_transcript(transcript_id)
    
    if not transcript:
        return jsonify({"error": "Transcript not found"}), 404
    
    return jsonify({"transcript": transcript})


@app.route('/api/transcripts', methods=['POST'])
def create_transcript():
    """Create a new transcript.
    
    Request JSON parameters:
        name (str): Name of the transcript
        messages (list, optional): Initial messages for the transcript
    
    Returns:
        JSON response with the created transcript
    """
    data = request.json
    name = data.get('name')
    messages = data.get('messages', [])
    
    if not name:
        return jsonify({"error": "Transcript name is required"}), 400
    
    # Ensure each message has a timestamp
    current_time = int(time.time() * 1000)
    for message in messages:
        if 'timestamp' not in message:
            message['timestamp'] = current_time
    
    manager = get_transcript_manager()
    transcript = manager.create_transcript(name, messages)
    
    return jsonify({"transcript": transcript}), 201


@app.route('/api/transcripts/<transcript_id>', methods=['PUT'])
def update_transcript(transcript_id):
    """Update a transcript.
    
    Request JSON parameters:
        name (str, optional): New name for the transcript
        messages (list, optional): Updated messages for the transcript
    
    Returns:
        JSON response with the updated transcript
    """
    data = request.json
    updates = {}
    
    if 'name' in data:
        updates['name'] = data['name']
    
    if 'messages' in data:
        messages = data['messages']
        # Ensure each message has a timestamp
        current_time = int(time.time() * 1000)
        for message in messages:
            if 'timestamp' not in message:
                message['timestamp'] = current_time
        updates['messages'] = messages
    
    manager = get_transcript_manager()
    transcript = manager.update_transcript(transcript_id, updates)
    
    if not transcript:
        return jsonify({"error": "Transcript not found"}), 404
    
    return jsonify({"transcript": transcript})


@app.route('/api/transcripts/<transcript_id>', methods=['DELETE'])
def delete_transcript(transcript_id):
    """Delete a transcript.
    
    Returns:
        JSON response indicating success or failure
    """
    manager = get_transcript_manager()
    success = manager.delete_transcript(transcript_id)
    
    if not success:
        return jsonify({"error": "Transcript not found"}), 404
    
    
    return jsonify({"success": True, "message": "Transcript deleted successfully"})


@app.route('/api/transcripts/import', methods=['POST'])
def import_transcript():
    """Import a transcript from JSON data.
    
    Request JSON parameters:
        transcript (dict): The transcript data to import
    
    Returns:
        JSON response with the imported transcript
    """
    data = request.json
    transcript_data = data.get('transcript')
    
    if not transcript_data:
        return jsonify({"error": "No transcript data provided"}), 400
    
    try:
        manager = get_transcript_manager()
        transcript = manager.import_transcript(transcript_data)
        return jsonify({"transcript": transcript}), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@app.route('/api/transcripts/<transcript_id>/touch', methods=['POST'])
def touch_transcript(transcript_id):
    """Update the last_modified timestamp of a transcript to mark it as recently accessed.
    
    Returns:
        JSON response indicating success or failure
    """
    manager = get_transcript_manager()
    transcript = manager.touch_transcript(transcript_id)
    
    if not transcript:
        return jsonify({"error": "Transcript not found"}), 404
    
    return jsonify({"success": True, "transcript": transcript})


@app.route('/api/transcripts/<transcript_id>/load', methods=['POST'])
def load_transcript(transcript_id):
    """Load a transcript into the current chat session.
    
    Returns:
        JSON response with the transcript data and updates the Interactor's message history
    """
    manager = get_transcript_manager()
    transcript = manager.get_transcript(transcript_id)
    
    if not transcript:
        return jsonify({"error": "Transcript not found"}), 404
    
    try:
        # Get the interactor and update its messages with the transcript's messages
        ai = get_interactor()
        
        # Clear existing messages but keep system prompt
        ai.messages_flush()  
        
        # Add each message from the transcript to the interactor
        for message in transcript['messages']:
            if message['role'] != 'system':  # Skip system messages as they're preserved by messages_flush
                # Handle different message formats (tool calls vs regular messages)
                if message.get('tool_calls'):
                    # This is an assistant message with tool calls
                    ai.history.append({
                        'role': message['role'],
                        'content': message.get('content'),
                        'tool_calls': message['tool_calls']
                    })
                elif message.get('tool_call_id'):
                    # This is a tool response message
                    ai.history.append({
                        'role': 'tool',
                        'content': message['content'],
                        'tool_call_id': message['tool_call_id']
                    })
                else:
                    # Regular user or assistant message
                    ai.messages_add(message['role'], message['content'])
        
        # Return the transcript data without marking it as touched
        # This prevents a race condition with duplicate message saving
        return jsonify({
            "success": True,
            "name": transcript['name'],
            "messages": transcript['messages']
        })
    except Exception as e:
        print(f"Error loading transcript: {str(e)}")
        return jsonify({"error": f"Failed to load transcript: {str(e)}"}), 500


@app.route('/api/transcripts/<transcript_id>/view', methods=['GET'])
def view_transcript(transcript_id):
    """Get a transcript for viewing purposes without affecting the active chat session.
    
    Returns:
        JSON response with the transcript data
    """
    manager = get_transcript_manager()
    transcript = manager.get_transcript(transcript_id)
    
    if not transcript:
        return jsonify({"error": "Transcript not found"}), 404
    
    # Return the transcript data directly without affecting the active session
    return jsonify({
        "success": True,
        "name": transcript['name'],
        "messages": transcript['messages']
    })


def create_app(test_config=None):
    """Create and configure the Flask application.
    
    Args:
        test_config: Test configuration to use instead of the default configuration
        
    Returns:
        Flask application instance
    """
    if test_config:
        app.config.update(test_config)
    
    # Initialize the interactor
    get_interactor()
    
    return app


def run_api(host='127.0.0.1', port=5000, debug=False):
    """Run the API server.
    
    Args:
        host (str): Host to run the server on
        port (int): Port to run the server on
        debug (bool): Whether to run in debug mode
    """
    app.run(host=host, port=port, debug=debug, threaded=True)


if __name__ == '__main__':
    run_api(debug=True)


# ----------------------------------------------------------------------
# Example curl commands for testing API functionality
# ----------------------------------------------------------------------

# Interact with the AI (non-streaming)
# Replace 'your message here' with your input text
# curl -X POST http://127.0.0.1:5000/api/interact -H "Content-Type: application/json" -d '{"message": "your message here", "stream": false}'

# Interact with the AI (streaming)
# curl -N -X POST http://127.0.0.1:5000/api/interact -H "Content-Type: application/json" -d '{"message": "hello"}'

# List available models
# curl http://127.0.0.1:5000/api/models

# Add a tool function dynamically
# curl -X POST http://127.0.0.1:5000/api/add_function -H "Content-Type: application/json" -d '{"module_path": "/path/to/your/module.py", "function_name": "your_function"}'

# Get registered functions
# curl http://127.0.0.1:5000/api/functions

# Set system prompt
# curl -X POST http://127.0.0.1:5000/api/system_prompt -H "Content-Type: application/json" -d '{"prompt": "You are a helpful assistant."}'

# Get conversation history
# curl http://127.0.0.1:5000/api/messages

# Add message to conversation history
# curl -X POST http://127.0.0.1:5000/api/messages -H "Content-Type: application/json" -d '{"role": "user", "content": "What is the weather today?"}'

# Clear conversation history
# curl -X DELETE http://127.0.0.1:5000/api/messages

# Get current model info
# curl http://127.0.0.1:5000/api/model

# Get interactor settings (excludes API keys)
# curl http://127.0.0.1:5000/api/settings

# Switch model (replace with actual values)
# curl -X POST http://127.0.0.1:5000/api/switch_model -H "Content-Type: application/json" -d '{"model": "openai:gpt-4", "api_key": "your_api_key"}'

# Get current context length
# curl http://127.0.0.1:5000/api/context_length

# Set context length
# curl -X POST http://127.0.0.1:5000/api/context_length -H "Content-Type: application/json" -d '{"context_length": 64000}'
