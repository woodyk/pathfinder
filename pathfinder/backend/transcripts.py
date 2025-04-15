#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# File: transcripts.py
# Description: Transcript management functionality with SQLite database
# Created: 2025-05-15
# Modified: 2025-04-14 17:46:09

import os
import json
import sqlite3
import time
from typing import Dict, List, Optional, Union, Any
from pathlib import Path
from datetime import datetime

class TranscriptManager:
    """Manages transcripts with a SQLite database backend"""
    
    def __init__(self, db_path: str = 'data/transcripts.db'):
        """Initialize the transcript manager with a SQLite database
        
        Args:
            db_path: Path to the SQLite database file
        """
        self.db_path = db_path
        self._ensure_db_exists()
    
    def _ensure_db_exists(self):
        """Ensure the database exists and has the correct schema"""
        db_exists = os.path.exists(self.db_path)
        
        with sqlite3.connect(self.db_path) as conn:
            if not db_exists:
                self._create_schema(conn)
            else:
                # Check if transcripts table exists
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='transcripts'")
                if not cursor.fetchone():
                    self._create_schema(conn)
    
    def _create_schema(self, conn: sqlite3.Connection):
        """Create the database schema
        
        Args:
            conn: SQLite database connection
        """
        cursor = conn.cursor()
        
        # Create the transcripts table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS transcripts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            date TEXT NOT NULL,
            messages TEXT NOT NULL,
            last_modified TEXT NOT NULL,
            is_deleted INTEGER DEFAULT 0
        )
        ''')
        
        # Create user_config table for future use
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            last_modified TEXT NOT NULL
        )
        ''')
        
        conn.commit()
    
    def get_all_transcripts(self) -> List[Dict[str, Any]]:
        """Get all transcripts from the database
        
        Returns:
            List of transcript objects
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, name, date, messages, last_modified FROM transcripts WHERE is_deleted = 0 ORDER BY last_modified DESC"
            )
            
            transcripts = []
            for row in cursor.fetchall():
                transcript = dict(row)
                # Parse the messages JSON
                transcript['messages'] = json.loads(transcript['messages'])
                transcripts.append(transcript)
            
            return transcripts
    
    def get_transcript(self, transcript_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific transcript by ID
        
        Args:
            transcript_id: The ID of the transcript to retrieve
            
        Returns:
            Transcript object or None if not found
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, name, date, messages, last_modified FROM transcripts WHERE id = ? AND is_deleted = 0",
                (transcript_id,)
            )
            
            row = cursor.fetchone()
            if row:
                transcript = dict(row)
                # Parse the messages JSON
                transcript['messages'] = json.loads(transcript['messages'])
                return transcript
            
            return None
    
    def create_transcript(self, name: str, messages: List[Dict[str, str]] = None) -> Dict[str, Any]:
        """Create a new transcript
        
        Args:
            name: Name of the transcript
            messages: Optional initial messages for the transcript
            
        Returns:
            The created transcript object
        """
        if messages is None:
            messages = [{"role": "system", "content": "Welcome to PathFinder. How can I help you today?"}]
        
        now = datetime.now().isoformat()
        transcript_id = f"transcript-{int(time.time() * 1000)}"
        
        transcript = {
            "id": transcript_id,
            "name": name,
            "date": now,
            "messages": messages,
            "last_modified": now
        }
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO transcripts (id, name, date, messages, last_modified) VALUES (?, ?, ?, ?, ?)",
                (
                    transcript["id"],
                    transcript["name"],
                    transcript["date"],
                    json.dumps(transcript["messages"]),
                    transcript["last_modified"]
                )
            )
            conn.commit()
        
        return transcript
    
    def update_transcript(self, transcript_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a transcript's properties
        
        Args:
            transcript_id: ID of the transcript to update
            updates: Dictionary of fields to update (name, messages)
            
        Returns:
            Updated transcript or None if not found
        """
        # Get the current transcript
        transcript = self.get_transcript(transcript_id)
        if not transcript:
            return None
        
        # Update fields
        if 'name' in updates:
            transcript['name'] = updates['name']
        
        if 'messages' in updates:
            transcript['messages'] = updates['messages']
        
        # Update last_modified timestamp
        transcript['last_modified'] = datetime.now().isoformat()
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE transcripts SET name = ?, messages = ?, last_modified = ? WHERE id = ?",
                (
                    transcript["name"],
                    json.dumps(transcript["messages"]),
                    transcript["last_modified"],
                    transcript_id
                )
            )
            conn.commit()
        
        return transcript
    
    def touch_transcript(self, transcript_id: str) -> Optional[Dict[str, Any]]:
        """Update the last_modified timestamp of a transcript to mark it as recently accessed
        
        Args:
            transcript_id: ID of the transcript to update
            
        Returns:
            Updated transcript or None if not found
        """
        # Get the current transcript
        transcript = self.get_transcript(transcript_id)
        if not transcript:
            return None
        
        # Update only the last_modified timestamp
        transcript['last_modified'] = datetime.now().isoformat()
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE transcripts SET last_modified = ? WHERE id = ?",
                (transcript["last_modified"], transcript_id)
            )
            conn.commit()
        
        return transcript
    
    def delete_transcript(self, transcript_id: str) -> bool:
        """Delete a transcript by ID (soft delete)
        
        Args:
            transcript_id: ID of the transcript to delete
            
        Returns:
            True if successful, False if not found
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE transcripts SET is_deleted = 1, last_modified = ? WHERE id = ?",
                (datetime.now().isoformat(), transcript_id)
            )
            conn.commit()
            
            return cursor.rowcount > 0
    
    def search_transcripts(self, query: str) -> List[Dict[str, Any]]:
        """Search transcripts by name or content
        
        Args:
            query: The search query
            
        Returns:
            List of matching transcript objects
        """
        search_term = f"%{query}%"
        
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, name, date, messages, last_modified 
                FROM transcripts 
                WHERE (name LIKE ? OR messages LIKE ?) AND is_deleted = 0
                ORDER BY last_modified DESC
                """,
                (search_term, search_term)
            )
            
            transcripts = []
            for row in cursor.fetchall():
                transcript = dict(row)
                # Parse the messages JSON
                transcript['messages'] = json.loads(transcript['messages'])
                transcripts.append(transcript)
            
            return transcripts
    
    def import_transcript(self, transcript_data: Dict[str, Any]) -> Dict[str, Any]:
        """Import a transcript from JSON data
        
        Args:
            transcript_data: The transcript data to import
            
        Returns:
            The imported transcript
        """
        # Validate required fields
        required_fields = ['name', 'messages']
        for field in required_fields:
            if field not in transcript_data:
                raise ValueError(f"Missing required field: {field}")
        
        # Generate new ID and set timestamps
        now = datetime.now().isoformat()
        transcript_id = f"transcript-{int(time.time() * 1000)}"
        
        transcript = {
            "id": transcript_id,
            "name": transcript_data["name"],
            "date": transcript_data.get("date", now),
            "messages": transcript_data["messages"],
            "last_modified": now
        }
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO transcripts (id, name, date, messages, last_modified) VALUES (?, ?, ?, ?, ?)",
                (
                    transcript["id"],
                    transcript["name"],
                    transcript["date"],
                    json.dumps(transcript["messages"]),
                    transcript["last_modified"]
                )
            )
            conn.commit()
        
        return transcript 
