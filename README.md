# VitalShield - IoT Health Monitoring Dashboard

VitalShield is a beginner-friendly, complete IoT health monitoring system simulated in Python. The project demonstrates how physical telemetry systems (like ESP32/Arduino medical devices) transmit sensor metrics to a web-based client application in real-time.

It consists of three core elements:
1. **IoT Sensor Simulator (`sensor.py`)**: A Python script simulating a wireless health device that generates and posts biometrics.
2. **Flask Backend Server (`server.py`)**: A web framework that manages a SQLite database, saves incoming telemetry, and serves API data.
3. **Frontend Dashboard (`index.html`, `style.css`, `script.js`)**: An interactive dashboard showing metrics, color-coded health statuses, and dynamic history graphs.

---

## Architecture Flow

```
+------------------+                   +------------------+                   +--------------------+
|  sensor.py       |   HTTP POST JSON  |  server.py       |  Writes to Disk   |  database.db       |
|  (ESP32 Mock)    |  ---------------> |  (Flask Server)  |  ---------------> |  (SQLite Database) |
+------------------+                   +------------------+                   +--------------------+
                                                |
                                                | HTTP GET
                                                v
                                       +------------------+
                                       |  static/script.js| ---> Updates DOM Cards & Chart.js
                                       |  (Web Dashboard) |
                                       +------------------+
```

---

## Features

- **Realistic Telemetry Simulation**: Simulates biometrics (Heart Rate, Oxygen Saturation, Body Temperature) within humanly realistic physiological limits.
- **SQLite Persistence**: Automatically creates databases, creates table schemas, and handles relational database storage.
- **Premium Glassmorphic UI**: High-end dark theme containing glowing accent styles and dynamic heartbeat CSS micro-animations.
- **Interactive Graphs**: Live telemetry charts built on Chart.js utilizing custom canvas color fills and bezier curves.
- **Automatic Polling**: Polling cycles every 5 seconds synchronizing backend data changes to the frontend dynamically.
- **Robust Error Handling**: Handles server-offline states with warnings on both the command line (sensor script) and frontend status banners.

---

## Project Structure

```
project/
│
├── requirements.txt         # Required Python packages (Flask, Requests)
├── sensor.py                 # Telemetry simulation script
├── server.py                 # Backend API, web routing, and database setup
├── database.db              # SQLite Database (generated automatically on startup)
│
├── templates/
│     └── index.html         # Frontend HTML structures and CDN imports
│
└── static/
      ├── style.css          # Glassmorphic dark styling, alerts, layout
      └── script.js          # REST fetching, UI rendering, Chart.js integrations
```

---

## Installation & Setup

Make sure you have **Python 3.7+** installed on your system.

### Step 1: Clone or Navigate to the Directory
Ensure you are in the workspace folder:
```bash
cd "c:\Users\HP Book\OneDrive\Documents\Iothealthmonitor"
```

### Step 2: Set up a Python Virtual Environment (Recommended)
Creating a virtual environment ensures this project's dependencies don't conflict with other Python projects on your machine.

* **On Windows (PowerShell):**
  ```powershell
  python -m venv venv
  .\venv\Scripts\Activate.ps1
  ```

* **On Windows (Command Prompt):**
  ```cmd
  python -m venv venv
  call venv\Scripts\activate.bat
  ```

### Step 3: Install Dependencies
Install the required packages listed in `requirements.txt`:
```bash
pip install -r requirements.txt
```

---

## How to Run the Project

To run the complete system, you must start **two processes** simultaneously (the server and the simulator).

### 1. Start the Flask Backend Server
In your first terminal window (with the virtual environment activated), run:
```bash
python server.py
```
* The server will initialize `database.db` and start listening for data on **`http://127.0.0.1:5000`**.
* You should see console outputs confirming:
  `Checking and initializing SQLite database...`
  `Database initialization complete.`

### 2. Start the Sensor Simulator
Open a **second terminal window**, navigate to the project directory, activate the virtual environment, and run:
```bash
python sensor.py
```
* The script will start generating mock readings and sending them to the backend every 5 seconds.
* You will see console outputs displaying the metrics sent:
  ```text
  [2026-06-09 13:05:00] Generated reading:
    - Heart Rate      : 84 bpm
    - SpO2            : 98%
    - Body Temperature: 36.8 °C
    --> Sent successfully! Server Response: Data saved.
  ```

### 3. Open the Dashboard
Open your web browser and navigate to:
**`http://127.0.0.1:5000`**

* The dashboard will load the modern dark-themed panel.
* You will watch the values and the graphs automatically refresh every 5 seconds as the simulator pumps new readings into the SQLite database.

---

## Code Explanation for Beginners

### The Database Setup (`server.py`)
We use Python's built-in `sqlite3` library. The line:
`cursor.execute('CREATE TABLE IF NOT EXISTS health_data (...)')`
ensures that if you run the program for the first time, it automatically creates a file named `database.db` and structures a table with the necessary columns so you don't have to configure it manually.

### The POST Endpoint (`server.py`)
An API endpoint is like a mailbox. When `sensor.py` sends an HTTP POST request to `http://127.0.0.1:5000/device`, the route `@app.route('/device', methods=['POST'])` wakes up, extracts the data fields, checks if they make sense (data validation), and writes them to the database using SQL:
`INSERT INTO health_data (device_id, heart_rate, ...) VALUES (?, ?, ...)`

### The GET Endpoint (`server.py` & `script.js`)
To update the charts, the browser runs code in `script.js` that periodically (every 5 seconds) sends an HTTP GET request to `/data`. The server queries the latest 20 values:
`SELECT * FROM health_data ORDER BY id DESC LIMIT 20`
It returns this data as a JSON array (a universal data format JavaScript understands). JavaScript receives this array, extracts the latest index to write numbers directly into the HTML labels, and feeds the entire array to the charts.
