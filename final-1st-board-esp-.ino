#include <SoftwareSerial.h>
#include <Servo.h>
#include <DHT.h>
#include <Dhcp.h>

// ===================== ESP SETUP =====================
SoftwareSerial esp(A4, A5); // RX, TX (A4 to ESP TX, A5 to ESP RX)
const char* WIFI_SSID = "test";
const char* WIFI_PASS = "12345678";
const char* SERVER_IP = "192.168.137.1"; // Your backend IP

// ===================== PIN DEFINITIONS =====================
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

long duration = 0;
int distance = -1;
int lastBand = -1;

unsigned long lastUpdate = 0;
const unsigned long UPDATE_INTERVAL = 2000;

bool manualServoOverride = false;
bool manualLampOverride = false;

// ===================== HELPERS =====================
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

// ===================== FIXES APPLIED HERE =====================
void initWiFi() {
  Serial.println(F("Resetting ESP8266..."));
  esp.println(F("AT+RST"));
  delay(3000);
  
  // Clear out the bootloader garbage text from the serial buffer
  while(esp.available()) { esp.read(); }
  
  esp.println(F("AT+CWMODE=1")); 
  delay(500);
  
  esp.println(F("AT+CIPMUX=1")); 
  delay(500);
  
  Serial.print(F("Connecting to WiFi: "));
  Serial.println(WIFI_SSID);
  
  esp.print(F("AT+CWJAP=\""));
  esp.print(WIFI_SSID);
  esp.print(F("\",\""));
  esp.print(WIFI_PASS);
  esp.println(F("\""));
  
  // CRITICAL FIX: Give the ESP up to 15 seconds to finish connecting to your router
  esp.setTimeout(15000); 
  
  if (esp.find("WIFI GOT IP")) {
    Serial.println(F("WiFi Connected successfully!"));
    delay(1000); 
    
    // Print the IP address to the monitor
    esp.setTimeout(1000); // Reset timeout back to normal
    esp.println(F("AT+CIFSR")); 
    delay(500);
    Serial.println(F("\n===== ESP8266 NETWORK INFO ====="));
    while (esp.available()) {
      char c = esp.read();
      Serial.write(c); 
    }
    Serial.println(F("================================\n"));
  } else {
    Serial.println(F("WiFi Connection Failed or Timed Out. Check SSID/Password."));
    esp.setTimeout(1000); // Reset timeout back to normal
  }
}

void handshakeWithServer() {
  Serial.print(F("Opening persistent TCP Connection to "));
  Serial.print(SERVER_IP);
  Serial.println(F(":5000..."));

  // Give the TCP connection attempt up to 5 seconds to connect
  esp.setTimeout(5000);

  esp.print(F("AT+CIPSTART=0,\"TCP\",\""));
  esp.print(SERVER_IP);
  esp.println(F("\",5000"));
  
  if (esp.find("CONNECT")) {
    Serial.println(F("TCP Handshake Successful!"));
    
    String handshakeMsg = "HELLO_FROM_IOT_BOARD_PLACEHOLDER\n";
    
    esp.print(F("AT+CIPSEND=0,"));
    esp.println(handshakeMsg.length());
    delay(200); 
    esp.print(handshakeMsg);
    
    Serial.println(F("TCP connection 0 left open for continuous data streaming."));
  } else {
    Serial.println(F("TCP Connection Failed. Ensure your backend server is running and firewall is off."));
  }
  
  esp.setTimeout(1000); // Reset timeout back to normal
}

// ===================== SETUP =====================
void setup() {
  Serial.begin(9600);
  
  // NOTE: If you used 115200 in your test to get "OK", change this to 115200!
  esp.begin(9600); 

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

  // Run network setup routines
  initWiFi();
  handshakeWithServer();

  // Start incoming command listener on Port 80
  esp.println(F("AT+CIPSERVER=1,80"));
  delay(2000);

  Serial.println(F("System fully initialized. Ready for automation."));
}

// ===================== LOOP =====================
void loop() {
  if (esp.available()) {
    String raw = esp.readStringUntil('\n');
    raw.trim();
    if (raw.length() > 0) {
      Serial.print(F("ESP raw incoming: "));
      Serial.println(raw);

      if (raw.indexOf("SERVO_ON") >= 0) {
        myServo.write(90);
        manualServoOverride = true;
        servoActive = false; 
        Serial.println(F("Servo forced ON via WiFi"));
      }
      else if (raw.indexOf("SERVO_OFF") >= 0) {
        myServo.write(0);
        manualServoOverride = false;
        Serial.println(F("Servo forced OFF via WiFi"));
      }
      else if (raw.indexOf("LAMP_ON") >= 0) {
        digitalWrite(LDR_LED_PIN, HIGH);
        manualLampOverride = true;
        Serial.println(F("Lamp ON via WiFi"));
      }
      else if (raw.indexOf("LAMP_OFF") >= 0) {
        digitalWrite(LDR_LED_PIN, LOW);
        manualLampOverride = false;
        Serial.println(F("Lamp OFF via WiFi"));
      }
    }
  }

  if (millis() - lastUpdate >= UPDATE_INTERVAL) {
    lastUpdate = millis();

    if (!manualLampOverride) {
      digitalWrite(LDR_LED_PIN, digitalRead(LDR_DO_PIN));
    }

    distance = measureDistanceCmRGB();
    Serial.print(F("RGB Distance: "));
    if (distance < 0) Serial.println(F("No echo"));
    else Serial.println(distance);
    applyBandIfChanged(bandFromDistance(distance));

    int moistureValue = medianOf5Moisture();
    Serial.print(F("Moisture: "));
    Serial.println(moistureValue);

    float humidity = dht.readHumidity();
    float temperatureC = dht.readTemperature();

    Serial.print(F("Humidity: "));
    Serial.print(humidity);
    Serial.print(F("%  Temp: "));
    Serial.print(temperatureC);
    Serial.println(F("°C"));

    if (moistureValid(moistureValue)) {
      if (moistureValue > DRY_THRESHOLD || (humidity < HUMIDITY_THRESHOLD && temperatureC > TEMP_THRESHOLD)) {
        digitalWrite(PUMP_PIN, HIGH);
        Serial.println(F("Pump ON"));
      } else {
        digitalWrite(PUMP_PIN, LOW);
        Serial.println(F("Pump OFF"));
      }
    } else {
      Serial.println(F("Moisture invalid, pump OFF"));
      digitalWrite(PUMP_PIN, LOW);
    }

    if (!manualServoOverride) {
      float distance_cm = measureDistanceServo();
      if (distance_cm > 0 && distance_cm < DETECTION_THRESHOLD) {
        if (!servoActive) {
          myServo.write(90);
          servoActive = true;
          Serial.print(F("Motion detected at "));
          Serial.println(distance_cm);
        }
        servoActiveTime = millis();
      }
      if (servoActive && millis() - servoActiveTime >= HOLD_DURATION) {
        myServo.write(0);
        servoActive = false;
        Serial.println(F("Servo returned to 0°"));
      }
    }

    Serial.println(F("------------------------"));
  }
}