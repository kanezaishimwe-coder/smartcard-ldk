#include <WiFi.h>
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>

#define SS_PIN 5
#define RST_PIN 21

MFRC522 rfid(SS_PIN, RST_PIN);

const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* API_URL = "http://192.168.1.10:3000/api/rfid/scan";

void connectWiFi() {
  Serial.print("Connecting to WiFi");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi connected");
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());
}

String getCardUID() {
  String uid = "";

  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) {
      uid += "0";
    }

    uid += String(rfid.uid.uidByte[i], HEX);
  }

  uid.toUpperCase();
  return uid;
}

void postRFIDToBackend(String cardUID) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected. Reconnecting...");
    connectWiFi();
  }

  HTTPClient http;

  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");

  String payload = "{\"cardId\":\"" + cardUID + "\"}";

  Serial.println();
  Serial.println("--------------------------------");
  Serial.println("Sending RFID scan to backend...");
  Serial.print("Card UID: ");
  Serial.println(cardUID);

  int httpCode = http.POST(payload);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.print("HTTP ");
    Serial.println(httpCode);
    Serial.println(response);
  } else {
    Serial.print("HTTP request failed: ");
    Serial.println(http.errorToString(httpCode));
  }

  http.end();
  Serial.println("--------------------------------");
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("================================");
  Serial.println("SMARTCARD L.D.K RFID READER");
  Serial.println("================================");

  SPI.begin();
  rfid.PCD_Init();

  Serial.println("MFRC522 reader initialized.");

  connectWiFi();

  Serial.println();
  Serial.println("RFID READER READY");
  Serial.println("Scan a card...");
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent()) {
    return;
  }

  if (!rfid.PICC_ReadCardSerial()) {
    return;
  }

  String cardUID = getCardUID();

  postRFIDToBackend(cardUID);

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  delay(2000);
}