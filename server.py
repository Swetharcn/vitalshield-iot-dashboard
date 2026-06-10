"""
IoT Health Monitoring Server
----------------------------
Updated version: Supporting Patient States and Diagnostics (Battery, RSSI).
It automatically retrofits the SQLite table schema if the database already exists.
"""

import sqlite3
import os
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# Define the database file name
DB_FILE = 'database.db'

def get_db_connection():
    """
    Establishes a connection to the SQLite database.
    """
    connection = sqlite3.connect(DB_FILE)
    connection.row_factory = sqlite3.Row
    return connection

def init_db():
    """
    Initializes the SQLite database.
    Creates the 'health_data' table and automatically applies migrations 
    if upgrading from older database versions.
    """
    print("Checking and initializing SQLite database...")
    connection = get_db_connection()
    cursor = connection.cursor()
    
    # 1. Create base table if it doesn't exist (using the updated schema)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS health_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            heart_rate REAL NOT NULL,
            spo2 REAL NOT NULL,
            body_temperature REAL NOT NULL,
            timestamp TEXT NOT NULL,
            patient_state TEXT,
            battery INTEGER,
            rssi INTEGER
        )
    ''')
    
    # 2. Database Migration: Check if new columns exist in the table (for backward compatibility)
    # PRAGMA table_info returns details about each column in the table
    cursor.execute("PRAGMA table_info(health_data)")
    existing_columns = [row['name'] for row in cursor.fetchall()]
    
    # If the database was created with the previous structure, we add the missing columns
    if 'patient_state' not in existing_columns:
        print("Migrating Database: Adding 'patient_state' column...")
        cursor.execute("ALTER TABLE health_data ADD COLUMN patient_state TEXT DEFAULT 'normal'")
        
    if 'battery' not in existing_columns:
        print("Migrating Database: Adding 'battery' column...")
        cursor.execute("ALTER TABLE health_data ADD COLUMN battery INTEGER DEFAULT 100")
        
    if 'rssi' not in existing_columns:
        print("Migrating Database: Adding 'rssi' column...")
        cursor.execute("ALTER TABLE health_data ADD COLUMN rssi INTEGER DEFAULT -60")
    
    connection.commit()
    connection.close()
    print("Database initialization and migration complete.")

# --- ROUTES ---

@app.route('/')
def index():
    """
    Dashboard Route
    Renders and returns the index.html template from the templates/ folder.
    """
    return render_template('index.html')


@app.route('/device', methods=['POST'])
def receive_data():
    """
    POST API Endpoint
    Receives JSON data from the sensor simulation script (with Patient States and Diagnostics).
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"status": "error", "message": "No JSON data received"}), 400
        
        # Extract base fields
        device_id = data.get('device_id')
        heart_rate = data.get('heart_rate')
        spo2 = data.get('spo2')
        body_temperature = data.get('body_temperature')
        timestamp = data.get('timestamp')
        
        # Extract new diagnostics fields (with default fallbacks if missing)
        patient_state = data.get('patient_state', 'normal')
        battery = data.get('battery', 100)
        rssi = data.get('rssi', -60)
        
        # Validate that required base fields are present
        if not all([device_id, heart_rate is not None, spo2 is not None, body_temperature is not None, timestamp]):
            return jsonify({"status": "error", "message": "Missing required health fields"}), 400
            
        # Basic validation checks
        if not (30 <= heart_rate <= 220):
            return jsonify({"status": "error", "message": "Invalid heart rate value"}), 400
        if not (50 <= spo2 <= 100):
            return jsonify({"status": "error", "message": "Invalid SpO2 value"}), 400
        if not (30.0 <= body_temperature <= 45.0):
            return jsonify({"status": "error", "message": "Invalid body temperature value"}), 400

        # Insert data (including state, battery, rssi) into SQLite
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute('''
            INSERT INTO health_data (
                device_id, heart_rate, spo2, body_temperature, timestamp, patient_state, battery, rssi
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            device_id, 
            float(heart_rate), 
            float(spo2), 
            float(body_temperature), 
            timestamp,
            patient_state,
            int(battery),
            int(rssi)
        ))
        connection.commit()
        connection.close()
        
        # Print status to server console
        print(f"[POST] Saved data from {device_id} [State: {patient_state}, Batt: {battery}%, RSSI: {rssi} dBm]")
        
        return jsonify({"status": "success", "message": "Data saved successfully"}), 201
        
    except Exception as e:
        print(f"Error saving device data: {e}")
        return jsonify({"status": "error", "message": "Internal server error: " + str(e)}), 500


@app.route('/data', methods=['GET'])
def get_data():
    """
    GET API Endpoint
    Retrieves the latest 20 health records from the database.
    """
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        
        # Select the latest 20 records
        cursor.execute('SELECT * FROM health_data ORDER BY id DESC LIMIT 20')
        rows = cursor.fetchall()
        connection.close()
        
        # Map SQLite row fields into JSON-serializable dictionaries
        records = []
        for row in rows:
            records.append({
                'id': row['id'],
                'device_id': row['device_id'],
                'heart_rate': row['heart_rate'],
                'spo2': row['spo2'],
                'body_temperature': row['body_temperature'],
                'timestamp': row['timestamp'],
                'patient_state': row['patient_state'] if 'patient_state' in row.keys() else 'normal',
                'battery': row['battery'] if 'battery' in row.keys() else 100,
                'rssi': row['rssi'] if 'rssi' in row.keys() else -60
            })
            
        # Sort chronologically (oldest to newest) for line charts
        records.reverse()
        
        return jsonify(records), 200
        
    except Exception as e:
        print(f"Error fetching data: {e}")
        return jsonify({"status": "error", "message": "Internal server error: " + str(e)}), 500


if __name__ == '__main__':
    # Initialize database and run schema alterations if needed
    init_db()
    
    print("Starting Flask Backend Server at http://127.0.0.1:5000")
    app.run(host='127.0.0.1', port=5000, debug=True)
