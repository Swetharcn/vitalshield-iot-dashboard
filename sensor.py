"""
IoT Patient State Simulation Script (sensor.py)
----------------------------------------------
This script simulates an advanced clinical IoT health telemetry monitor.
It implements:
1. A Structured Patient State Machine (resting, normal, walking, exercise, recovery).
2. A Proportional-Control Target Drift algorithm for random walking.
3. Diagnostic parameters: Battery percentage and WiFi Signal Strength (RSSI).

Instead of erratic fluctuations, values drift smoothly toward baseline targets 
defined by the patient's current physical state, mimicking real physiology.
"""

import time
import random
from datetime import datetime
import requests

# Connection variables
SERVER_URL = "http://127.0.0.1:5000/device"
DEVICE_ID = "health_device_01"

# --- PHYSIOLOGICAL STATE DEFINITIONS ---
# Each state dictates the baseline target values the biometrics will drift towards.
STATE_PROFILES = {
    'resting':  {'hr': 68.0,  'spo2': 98.8, 'temp': 36.3, 'label': 'Resting'},
    'normal':   {'hr': 78.0,  'spo2': 97.8, 'temp': 36.6, 'label': 'Normal Activity'},
    'walking':  {'hr': 88.0,  'spo2': 96.8, 'temp': 37.0, 'label': 'Walking'},
    'exercise': {'hr': 104.0, 'spo2': 93.8, 'temp': 37.9, 'label': 'Exercising'},
    'recovery': {'hr': 76.0,  'spo2': 97.5, 'temp': 36.7, 'label': 'Recovering'}
}

# State Sequencer to ensure alert conditions (exercise) are rare and realistic
# Cycle: resting -> normal -> walking -> normal -> exercise -> recovery -> repeat
STATE_CYCLE = ['resting', 'normal', 'walking', 'normal', 'exercise', 'recovery']
current_cycle_index = 0
ticks_in_current_state = 0

# --- STATE VARIABLES ---
current_heart_rate = 74.0
current_spo2 = 98.0
current_temperature = 36.4
current_battery = 100.0
current_rssi = -60

def select_next_state():
    """
    Cycles to the next patient state in the sequence and sets a random duration (in ticks).
    Each tick represents 5 seconds.
    - Non-alert states (resting, normal, walking) last longer (30-40 ticks ~ 2.5-3.5 mins).
    - Alert states (exercise) are short (12-18 ticks ~ 1-1.5 mins) to keep alerts rare.
    """
    global current_cycle_index, ticks_in_current_state
    
    # Move to the next state in our cycle array
    current_cycle_index = (current_cycle_index + 1) % len(STATE_CYCLE)
    state = STATE_CYCLE[current_cycle_index]
    ticks_in_current_state = 0
    
    # Set durations
    if state == 'exercise':
        duration = random.randint(12, 18)   # Short workout session (60-90 seconds)
    elif state == 'recovery':
        duration = random.randint(20, 25)   # Recovery window (100-125 seconds)
    else:
        duration = random.randint(30, 45)   # Resting/normal states last much longer (2.5-3.7 mins)
        
    return state, duration

# Initialize first state
current_state, state_duration_ticks = STATE_CYCLE[0], random.randint(30, 45)

def update_simulation():
    """
    Calculates physiological updates based on current state targets using
    proportional control steering.
    Also handles battery discharge and signal RSSI fluctuations.
    """
    global current_heart_rate, current_spo2, current_temperature
    global current_battery, current_rssi, current_state, state_duration_ticks, ticks_in_current_state
    
    # 1. Check if we need to transition to a new patient state
    ticks_in_current_state += 1
    if ticks_in_current_state >= state_duration_ticks:
        current_state, state_duration_ticks = select_next_state()
        print(f"\n>>> PATIENT STATE TRANSITION: Entering '{STATE_PROFILES[current_state]['label']}' state for {state_duration_ticks * 5} seconds. <<<")

    # Get targets for the current state
    profile = STATE_PROFILES[current_state]
    target_hr = profile['hr']
    target_spo2 = profile['spo2']
    target_temp = profile['temp']
    
    # 2. PROPORTIONAL TARGET DRIFT FORMULAS
    # Drift = small random noise + correction factor pulling values towards target baseline.
    # This prevents values from jumping erratically and produces smooth, natural trends.
    
    # Heart Rate update
    hr_noise = random.uniform(-1.2, 1.2)
    hr_steering = (target_hr - current_heart_rate) * 0.08  # Pull towards target
    current_heart_rate += hr_noise + hr_steering
    # Absolute Medical Clamping
    current_heart_rate = max(60.0, min(110.0, current_heart_rate))
    
    # SpO2 update
    spo2_noise = random.uniform(-0.3, 0.3)
    spo2_steering = (target_spo2 - current_spo2) * 0.08
    current_spo2 += spo2_noise + spo2_steering
    # Absolute Medical Clamping
    current_spo2 = max(90.0, min(100.0, current_spo2))
    
    # Temperature update
    temp_noise = random.uniform(-0.12, 0.12)
    temp_steering = (target_temp - current_temperature) * 0.08
    current_temperature += temp_noise + temp_steering
    # Absolute Medical Clamping
    current_temperature = max(35.5, min(39.0, current_temperature))
    
    # 3. DIAGNOSTICS UPDATES
    # Slowly drain battery by 0.02% every 5 seconds (takes ~4 hours to drain 100%)
    current_battery -= 0.02
    if current_battery < 0.0:
        current_battery = 100.0 # Auto recharge if it fully drains
        
    # Fluctuating signal RSSI between -50 dBm (Excellent) and -75 dBm (Fair)
    rssi_drift = random.choice([-2, -1, 0, 1, 2])
    current_rssi += rssi_drift
    current_rssi = max(-75, min(-50, current_rssi))
    
    # 4. PACKAGE DATA
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    payload = {
        "device_id": DEVICE_ID,
        "heart_rate": round(current_heart_rate, 1),
        "spo2": round(current_spo2, 1),
        "body_temperature": round(current_temperature, 1),
        "timestamp": current_time,
        "patient_state": current_state,
        "battery": int(current_battery),
        "rssi": current_rssi
    }
    
    return payload

def main():
    print("=" * 65)
    print("       VitalShield Clinical Patient Telemetry Simulator Starting      ")
    print(f" Simulating Device ID : {DEVICE_ID}")
    print(f" Posting Target URL   : {SERVER_URL}")
    print(" Update Frequency     : Every 5 seconds")
    print(f" Initial State        : {STATE_PROFILES[current_state]['label']} ({state_duration_ticks * 5}s)")
    print(" Press Ctrl+C to terminate.")
    print("=" * 65)
    
    while True:
        try:
            # Generate updates
            payload = update_simulation()
            
            # Print state details to terminal
            print(f"\n[{payload['timestamp']}] state: {payload['patient_state'].upper()} | batt: {payload['battery']}% | rssi: {payload['rssi']}dBm")
            print(f"  - Heart Rate      : {payload['heart_rate']} bpm (Target: {STATE_PROFILES[current_state]['hr']})")
            print(f"  - SpO2            : {payload['spo2']}% (Target: {STATE_PROFILES[current_state]['spo2']})")
            print(f"  - Temperature     : {payload['body_temperature']} °C (Target: {STATE_PROFILES[current_state]['temp']})")
            
            # Send HTTP POST to server
            response = requests.post(SERVER_URL, json=payload, timeout=4)
            
            if response.status_code == 201:
                print("  --> Telemetry sent successfully.")
            else:
                print(f"  --> Save error! Response code: {response.status_code}")
                
        except requests.exceptions.ConnectionError:
            print("  --> Connection Error: Flask backend is offline. Retrying in 5 seconds...")
        except Exception as e:
            print(f"  --> Unexpected error: {e}")
            
        time.sleep(5)

if __name__ == "__main__":
    main()
