#include <Arduino.h>

const int relayPins[10] = {2, 3, 4, 5, 6, 7, 8, 9, 10, 11};
bool relayStates[10] = {false};
unsigned long relayTimers[10] = {0};
const unsigned long showerDuration = 480000UL; // 8 minutes
String buffer = "";

void setup() {
  for (int i = 0; i < 10; i++) {
    pinMode(relayPins[i], OUTPUT);
    digitalWrite(relayPins[i], HIGH);
    relayStates[i] = false;
    relayTimers[i] = 0;
  }
  Serial.begin(9600);
  Serial.println("Arduino started");
  Serial.print("Shower duration set to: ");
  Serial.println(showerDuration);
  Serial.println("Initial relay states:");
  for (int i = 0; i < 10; i++) {
    Serial.print("Relay ");
    Serial.print(i + 1);
    Serial.println(" OFF (default)");
  }
}

void loop() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    buffer += c;
    if (c == '\n') {
      buffer.trim();
      Serial.print("Received command: ");
      Serial.println(buffer);

      if (buffer.startsWith("ACTIVATE ")) {
        int relayNum = buffer.substring(9).toInt();
        if (relayNum >= 1 && relayNum <= 10) {
          activateRelay(relayNum - 1);
        } else {
          Serial.println("Invalid relay number (1-10)");
        }
      } else if (buffer.startsWith("DEACTIVATE ")) {
        int relayNum = buffer.substring(11).toInt();
        if (relayNum >= 1 && relayNum <= 10) {
          deactivateRelay(relayNum - 1);
        } else {
          Serial.println("Invalid relay number (1-10)");
        }
      } else if (buffer == "STATUS") {
        sendStatus();
      }
      buffer = "";
    }
  }
  checkTimers();
}

void activateRelay(int relayIndex) {
  if (!relayStates[relayIndex]) {
    digitalWrite(relayPins[relayIndex], LOW); // Turn on (active-low)
    relayStates[relayIndex] = true;
    unsigned long currentMillis = millis();
    relayTimers[relayIndex] = currentMillis + showerDuration;
    Serial.print("Relay ");
    Serial.print(relayIndex + 1);
    Serial.print(" ON, Current: ");
    Serial.print(currentMillis);
    Serial.print(", Expires: ");
    Serial.println(relayTimers[relayIndex]);
  }
}

void deactivateRelay(int relayIndex) {
  Serial.print("Deactivating relay ");
  Serial.print(relayIndex + 1);
  Serial.print(", current state: ");
  Serial.println(relayStates[relayIndex] ? "ON" : "OFF");
  if (relayStates[relayIndex]) {
    digitalWrite(relayPins[relayIndex], HIGH); // Turn off (active-low)
    relayStates[relayIndex] = false;
    relayTimers[relayIndex] = 0;
    Serial.print("Relay ");
    Serial.print(relayIndex + 1);
    Serial.println(" OFF (manual)");
  } else {
    Serial.print("Relay ");
    Serial.print(relayIndex + 1);
    Serial.println(" already OFF");
  }
}

void checkTimers() {
  unsigned long currentTime = millis();
  for (int i = 0; i < 10; i++) {
    if (relayStates[i] && relayTimers[i] > 0 && currentTime >= relayTimers[i]) {
      digitalWrite(relayPins[i], HIGH);
      relayStates[i] = false;
      relayTimers[i] = 0;
      Serial.print("Relay ");
      Serial.print(i + 1);
      Serial.println(" OFF (timer expired)");
      Serial.print("TIMEOUT ");
      Serial.println(i + 1);
    }
  }
}

void sendStatus() {
  for (int i = 0; i < 10; i++) {
    Serial.print("Relay ");
    Serial.print(i + 1);
    Serial.print(": ");
    Serial.println(relayStates[i] ? "ON" : "OFF");
  }
}