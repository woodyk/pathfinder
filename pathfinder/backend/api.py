#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# File: api.py
# Author: Wadih Khairallah
# Description: RESTful API interface for the Interactor class
#              Exposes AI interaction functionality for web applications
# Created: 2025-04-07 10:00:00
# Modified: 2025-04-07 21:07:59

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
from .tools.search_google import search_google

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Global interactor instance
interactor = None

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
    return interactor


@app.route('/api/interact', methods=['POST'])
def api_interact():
    """Interact with the AI model and get a response.
    
    Request JSON parameters:
        message (str): The user's input message
        attachments (list, optional): List of extracted text from attachments
        stream (bool, optional): Whether to stream the response (default: True)
        tools (bool, optional): Whether to enable tool calling (default: True)
        model (str, optional): Model to use for this interaction
        markdown (bool, optional): Whether to render markdown (default: False)
    
    Returns:
        If streaming is enabled: A streaming response with chunks of the AI's response
        If streaming is disabled: A JSON response with the AI's complete response
    """
    data = request.json
    user_input = data.get('message', '')
    attachments = data.get('attachments', [])
    stream_enabled = data.get('stream', True)
    tools_enabled = data.get('tools', True)
    model = data.get('model')
    markdown = data.get('markdown', False)
    
    # Combine user input with attachment content
    full_message = user_input
    
    if attachments:
        full_message += "\n\nAttached document content:\n"
        for i, attachment in enumerate(attachments, 1):
            full_message += f"\n--- Document {i} ---\n{attachment}\n"
    
    if not full_message.strip():
        return jsonify({"error": "No message or attachments provided"}), 400
    
    ai = get_interactor()
    
    if stream_enabled:
        def generate():
            q = Queue()
            
            def stream_callback(token):
                q.put(token)
            
            def generate_response():
                try:
                    ai.interact(
                        full_message, 
                        output_callback=stream_callback, 
                        stream=True, 
                        tools=tools_enabled,
                        model=model,
                        markdown=markdown
                    )
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
        response = ai.interact(
            full_message, 
            stream=False, 
            tools=tools_enabled,
            model=model,
            markdown=markdown,
            quiet=True
        )
        return jsonify({"response": response})


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
    
    ai = get_interactor()
    messages = ai.messages_add(role, content)
    
    return jsonify({"messages": messages})


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


@app.route('/api/files/delete', methods=['POST'])
def delete_user_file():
    """Delete a file or directory from the user_data directory.
    
    Request JSON parameters:
        path (str): Relative path to the file/directory within user_data
        is_directory (bool, optional): Whether the path is a directory (default: False)
    
    Returns:
        JSON response indicating success or failure
    """
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
                        lines = []
                        for i, line in enumerate(f):
                            if i >= 1000:  # Limit to 1000 lines
                                break
                            lines.append(line.rstrip('\n'))
                        info["preview"] = '\n'.join(lines)
                        info["preview_type"] = "text"
                except UnicodeDecodeError:
                    try:
                        extracted_text = extract_text(full_path)
                        if extracted_text:
                            info["preview"] = extracted_text[:10000]  # Limit to 10000 characters
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
