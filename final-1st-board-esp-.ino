#include <SoftwareSerial.h>
#include <Servo.h>
#include <DHT.h>
#include "SmartParkHTTP.h"

// ===================== ESP SETUP =====================
SoftwareSerial espSerial(A4, A5); // RX, TX (A4 to ESP TX, A5 to ESP RX)
SmartParkHTTP network(espSerial);

const char* WIFI_SSID = "test";
const char* WIFI_PASS = "12345678";
const char* SERVER_IP = "192.168.137.1"; // Your backend IP

// ===================== PIN DEFINITIONS =====================
// ... (rest of pin definitions remain unchanged)
#define MOISTURE_SENSOR_PIN A0
#define PUMP_PIN 7
#define DRY_THRESHOLD 500
#define HUMIDITY_THRESHOLD 60
#define TEMP_THRESHOLD 30

const int trigPin = 9;
const int echoPin = 10;

const int redPin   = 11;
const int greenPin = 6;
const int bluePin  = 5;
const bool COMMON_ANODE = false;

const int LDR_DO_PIN  = 8;
const int LDR_LED_PIN = 12;

const int TRIG_PIN = 2;
const int ECHO_PIN = 3;
const int SERVO_PIN = 4;
const int DETECTION_THRESHOLD = 7;

const int DHTPIN = 13;
const int DHTTYPE = DHT11;
DHT dht(DHTPIN, DHTTYPE);

// ===================== STATE VARIABLES =====================
Servo myServo;
bool servoActive = false;
unsigned long servoActiveTime = 0;
const unsigned long HOLD_DURATION = 2000;
int servoPos = 0; // Tracks physical position (0 or 90)

long duration = 0;
int distance = -1;
int lastBand = -1;

unsigned long lastUpdate = 0;
const unsigned long UPDATE_INTERVAL = 2000;

bool manualServoOverride = false;
bool manualLampOverride = false;

// ===================== HELPERS =====================
void sendTelemetry(int moisture, float humidity, float temp, int rgbDist, float servoDist, bool ldr, bool pump, bool isServoOpen) {
  // Build JSON payload
  String payload = "{";
  payload += "\"moisture\":" + String(moisture) + ",";
  payload += "\"humidity\":" + String(humidity) + ",";
  payload += "\"temperature\":" + String(temp) + ",";
  payload += "\"rgbDistance\":" + String(rgbDist) + ",";
  payload += "\"servoDistance\":" + String(servoDist) + ",";
  payload += "\"ldrStatus\":\"" + String(ldr ? "ON" : "OFF") + "\",";
  payload += "\"pumpStatus\":\"" + String(pump ? "ON" : "OFF") + "\",";
  payload += "\"servoStatus\":\"" + String(isServoOpen ? "OPEN" : "CLOSED") + "\"";
  payload += "}";

  Serial.println(F("[System] Transmitting telemetry..."));
  if (network.post(SERVER_IP, 5000, "/api/hardware/telemetry", payload)) {
    Serial.println(F("[System] SUCCESS: Data logged."));
  } else {
    Serial.println(F("[System] WARNING: Telemetry transmission failed."));
  }
}

inline void pwmWrite(int pin, uint8_t v) {
  analogWrite(pin, COMMON_ANODE ? (255 - v) : v);
}

void setColor(uint8_t r, uint8_t g, uint8_t b) {
  pwmWrite(redPin, r);
  pwmWrite(greenPin, g);
  pwmWrite(bluePin, b);
}

int measureDistanceRawOnceRGB() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  long t = pulseIn(echoPin, HIGH, 30000UL);
  if (t == 0) return -1;
  return (int)(t * 0.034 / 2.0);
}

int median3(int a, int b, int c) {
  if (a > b) { int t=a; a=b; b=t; }
  if (b > c) { int t=b; b=c; c=t; }
  if (a > b) { int t=a; a=b; b=t; }
  return b;
}

int measureDistanceCmRGB() {
  int d1 = measureDistanceRawOnceRGB();
  int d2 = measureDistanceRawOnceRGB();
  int d3 = measureDistanceRawOnceRGB();
  if (d1 < 0 && d2 < 0 && d3 < 0) return -1;
  if (d1 < 0) d1 = d2;
  if (d3 < 0) d3 = d2;
  return median3(d1, d2, d3);
}

int bandFromDistance(int d) {
  if (d < 0) return -1;
  if (d <= 5)  return 0;
  if (d <= 10) return 1;
  if (d <= 15) return 2;
  return 2;
}

void applyBandIfChanged(int band) {
  if (band == lastBand) return;
  switch(band) {
    case 0: setColor(255, 0, 0); Serial.println(F("LED: RED")); break;
    case 1: setColor(255, 255, 0); Serial.println(F("LED: YELLOW")); break;
    case 2: setColor(0, 255, 0); Serial.println(F("LED: GREEN")); break;
    default: return;
  }
  lastBand = band;
}

int readMoistureRawOnce() {
  analogRead(MOISTURE_SENSOR_PIN);
  delayMicroseconds(150);
  return analogRead(MOISTURE_SENSOR_PIN);
}

int medianOf5Moisture() {
  int v[5];
  for (int i=0; i<5; i++) v[i]=readMoistureRawOnce();
  for (int i=1;i<5;i++){
    int key=v[i], j=i-1;
    while (j>=0 && v[j] > key) { v[j+1]=v[j]; j--; }
    v[j+1]=key;
  }
  return v[2];
}

bool moistureValid(int raw) {
  return (raw > 0 && raw < 1023);
}

float measureDistanceServo() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long t = pulseIn(ECHO_PIN, HIGH);
  if (t == 0) return -1;
  return (t * 0.034) / 2;
}

// ===================== SETUP =====================
void setup() {
  Serial.begin(9600);
  espSerial.begin(9600); 

  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(redPin, OUTPUT);
  pinMode(greenPin, OUTPUT);
  pinMode(bluePin, OUTPUT);
  setColor(0,0,0);
  pinMode(PUMP_PIN, OUTPUT);
  digitalWrite(PUMP_PIN, LOW);
  pinMode(LDR_DO_PIN, INPUT);
  pinMode(LDR_LED_PIN, OUTPUT);
  digitalWrite(LDR_LED_PIN, LOW);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  myServo.attach(SERVO_PIN);
  myServo.write(0);
  dht.begin();

  // Initialize Network via Wrapper
  if (network.connectWiFi(WIFI_SSID, WIFI_PASS)) {
    Serial.println(F("System Online."));
  } else {
    Serial.println(F("System Offline. Check WiFi."));
  }

  Serial.println(F("System fully initialized. Ready for automation."));
}

// ===================== LOOP =====================
void loop() {
  // Listen for Remote Commands via Wrapper
  String cmd = network.listenForCommands();
  if (cmd.length() > 0) {
    Serial.print(F("Remote Command: "));
    Serial.println(cmd);

    if (cmd.indexOf("SERVO_ON") >= 0) {
      myServo.write(90);
      servoPos = 90;
      manualServoOverride = true;
      servoActive = false; 
    }
    else if (cmd.indexOf("SERVO_OFF") >= 0) {
      myServo.write(0);
      servoPos = 0;
      manualServoOverride = true;
      servoActive = false;
    }
    else if (cmd.indexOf("SERVO_AUTO") >= 0) {
      manualServoOverride = false;
    }
    else if (cmd.indexOf("LAMP_ON") >= 0) {
      digitalWrite(LDR_LED_PIN, HIGH);
      manualLampOverride = true;
    }
    else if (cmd.indexOf("LAMP_OFF") >= 0) {
      digitalWrite(LDR_LED_PIN, LOW);
      manualLampOverride = false;
    }
  }

  if (millis() - lastUpdate >= UPDATE_INTERVAL) {
    lastUpdate = millis();

    if (!manualLampOverride) {
      digitalWrite(LDR_LED_PIN, digitalRead(LDR_DO_PIN));
    }

    distance = measureDistanceCmRGB();
    applyBandIfChanged(bandFromDistance(distance));

    int moistureValue = medianOf5Moisture();
    float humidity = dht.readHumidity();
    float temperatureC = dht.readTemperature();

    if (moistureValid(moistureValue)) {
      if (moistureValue > DRY_THRESHOLD || (humidity < HUMIDITY_THRESHOLD && temperatureC > TEMP_THRESHOLD)) {
        digitalWrite(PUMP_PIN, HIGH);
      } else {
        digitalWrite(PUMP_PIN, LOW);
      }
    } else {
      digitalWrite(PUMP_PIN, LOW);
    }

    float currentServoDist = measureDistanceServo();
    if (!manualServoOverride) {
      if (currentServoDist > 0 && currentServoDist < DETECTION_THRESHOLD) {
        if (!servoActive) {
          myServo.write(90);
          servoPos = 90;
          servoActive = true;
        }
        servoActiveTime = millis();
      }
      if (servoActive && millis() - servoActiveTime >= HOLD_DURATION) {
        myServo.write(0);
        servoPos = 0;
        servoActive = false;
      }
    }

    // --- Send HTTP Telemetry via Wrapper ---
    sendTelemetry(
      moistureValue, 
      humidity, 
      temperatureC, 
      distance, 
      currentServoDist, 
      digitalRead(LDR_LED_PIN), 
      digitalRead(PUMP_PIN), 
      (servoPos == 90)
    );
  }
}