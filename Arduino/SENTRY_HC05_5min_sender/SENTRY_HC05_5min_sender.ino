/*
 * SENTRY Arduino -> HC-05 -> Chrome/Edge -> SENTRY web dashboard
 * For Arduino Uno/Nano (AVR), DHT11, HC-05 (Bluetooth Classic SPP)
 * Data packet: one JSON object followed by '\n', at 9600 baud.
 * Periodic upload: once every 300,000 milliseconds (5 minutes).
 * Optional READ\n command from website: send a packet immediately,
 * without resetting the periodic schedule.
 *
 * NOTE: HC-05 does not itself store data or upload to the Internet.
 * Open the SENTRY web dashboard on a paired PC to receive packets.
 */
#include <DHT.h>
#include <SoftwareSerial.h>
#include <math.h>
#include <string.h>

#define DOOR_PIN 2
#define IR_PIN 3
#define TILT_PIN 5
#define DHT_PIN 6
#define BUZZER_PIN 8
#define DHT_TYPE DHT11

#define BT_RX_PIN 10   // Arduino RX: connect to HC-05 TX
#define BT_TX_PIN 11   // Arduino TX: connect to HC-05 RX through level conversion

DHT dht(DHT_PIN, DHT_TYPE);
SoftwareSerial bluetooth(BT_RX_PIN, BT_TX_PIN);

const int DOOR_CLOSED_LEVEL = LOW;
const int TILT_NORMAL_LEVEL = HIGH;
const int IR_DETECTED_LEVEL = LOW;
const int BUZZER_ON = HIGH;
const int BUZZER_OFF = LOW;

// Keep original alarm policy (only the door activates the buzzer).
const bool ALARM_DOOR = true;
const bool ALARM_TILT = false;
const bool ALARM_DHT_ERROR = false;
const bool ALARM_IR = false;

const unsigned long DHT_INTERVAL = 2000UL;
const unsigned long SEND_INTERVAL = 300000UL;

float temperature = NAN;
float humidity = NAN;
bool dhtError = false;
bool dhtReady = false;
unsigned long lastDHT = 0;
unsigned long lastPeriodicSend = 0;
bool firstPeriodicSent = false;
bool requestPending = false;
char command[12];
byte commandLength = 0;

void printBoolean(Stream &output, bool value) {
  output.print(value ? F("true") : F("false"));
}

void printMeasurement(Stream &output, float value) {
  if (dhtError || isnan(value)) output.print(F("null"));
  else output.print(value, 1);
}

void sendPacket(Stream &output, bool doorClosed, bool tilted,
                bool irDetected, bool buzzerOn) {
  // Website status is independent of the buzzer alarm configuration.
  bool requiresCheck = !doorClosed || tilted || !irDetected || dhtError;
  output.print(F("{\"device\":\"SENTRY-01\",\"temperature\":"));
  printMeasurement(output, temperature);
  output.print(F(",\"humidity\":"));
  printMeasurement(output, humidity);
  output.print(F(",\"doorClosed\":"));
  printBoolean(output, doorClosed);
  output.print(F(",\"tilted\":"));
  printBoolean(output, tilted);
  output.print(F(",\"irDetected\":"));
  printBoolean(output, irDetected);
  output.print(F(",\"dhtError\":"));
  printBoolean(output, dhtError);
  output.print(F(",\"buzzerOn\":"));
  printBoolean(output, buzzerOn);
  output.print(F(",\"status\":\""));
  output.print(requiresCheck ? F("CHECK_REQUIRED") : F("NORMAL"));
  output.println(F("\"}"));
}

void readBluetoothCommands() {
  // A short fixed buffer is used to avoid String heap fragmentation on AVR.
  while (bluetooth.available() > 0) {
    char ch = (char)bluetooth.read();
    if (ch == '\r' || ch == '\n') {
      command[commandLength] = '\0';
      if (strcmp(command, "READ") == 0) requestPending = true;
      commandLength = 0;
    } else if (commandLength < sizeof(command) - 1) {
      command[commandLength++] = ch;
    } else {
      // Reject oversized commands.
      commandLength = 0;
    }
  }
}

void setup() {
  Serial.begin(9600);
  bluetooth.begin(9600);  // HC-05 must be in data mode at 9600 baud.
  pinMode(DOOR_PIN, INPUT);
  pinMode(IR_PIN, INPUT);
  pinMode(TILT_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, BUZZER_OFF);
  dht.begin();
  Serial.println(F("SENTRY HC-05 ready: JSON every 5 minutes; READ for on-demand."));
}

void loop() {
  const unsigned long now = millis();
  // Continuous digital sensing keeps the door buzzer responsive.
  const bool doorClosed = (digitalRead(DOOR_PIN) == DOOR_CLOSED_LEVEL);
  const bool tilted = (digitalRead(TILT_PIN) != TILT_NORMAL_LEVEL);
  const bool irDetected = (digitalRead(IR_PIN) == IR_DETECTED_LEVEL);

  if (now - lastDHT >= DHT_INTERVAL) {
    lastDHT = now;
    dhtReady = true;
    const float t = dht.readTemperature();
    const float h = dht.readHumidity();
    if (isnan(t) || isnan(h)) {
      dhtError = true;
    } else {
      dhtError = false;
      temperature = t;
      humidity = h;
    }
  }

  const bool buzzerWarning =
      (ALARM_DOOR && !doorClosed) ||
      (ALARM_TILT && tilted) ||
      (ALARM_DHT_ERROR && dhtError) ||
      (ALARM_IR && !irDetected);
  digitalWrite(BUZZER_PIN, buzzerWarning ? BUZZER_ON : BUZZER_OFF);

  readBluetoothCommands();
  const bool periodicDue = !firstPeriodicSent ||
      (now - lastPeriodicSend >= SEND_INTERVAL);
  if (dhtReady && (periodicDue || requestPending)) {
    sendPacket(bluetooth, doorClosed, tilted, irDetected, buzzerWarning);
    sendPacket(Serial, doorClosed, tilted, irDetected, buzzerWarning);
    requestPending = false;
    if (periodicDue) {
      lastPeriodicSend = now;
      firstPeriodicSent = true;
    }
  }
}
