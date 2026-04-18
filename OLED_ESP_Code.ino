#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebSocketsServer.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>

// ==========================
// WiFi
// ==========================
const char* ssid     = "vivo s1";
const char* password = "abcd1333";

// ==========================
// UDP DISCOVERY
// ==========================
WiFiUDP udp;
unsigned long lastBroadcast = 0;
bool wsConnected = false;

// ==========================
// WebSocket Server
// ==========================
WebSocketsServer webSocket = WebSocketsServer(81);
uint8_t connectedClient = 255;

// ==========================
// OLED (SH1106)
// ==========================
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

#define SDA_PIN 8
#define SCL_PIN 9

Adafruit_SH1106G display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// ==========================
// TEXT BUFFER
// ==========================
String currentText = "";

// =======================================================
// 📡 WIFI CONNECT
// =======================================================
void connectWiFi() {
  WiFi.begin(ssid, password);
  Serial.print("Connecting WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\n✅ Connected!");
  Serial.println(WiFi.localIP());
}

// =======================================================
// 📡 UDP BROADCAST
// =======================================================
void broadcastPresence() {
  if (wsConnected) return;

  if (millis() - lastBroadcast < 2000) return;

  lastBroadcast = millis();

  String payload = "{\"role\":\"oled_display\",\"ip\":\"" + WiFi.localIP().toString() + "\"}";

  udp.beginPacket(IPAddress(255, 255, 255, 255), 12345);
  udp.print(payload);
  udp.endPacket();

  Serial.println("📡 Broadcasting: " + payload);
}

// =======================================================
// 🖥️ OLED INIT
// =======================================================
void setupDisplay() {
  Wire.begin(SDA_PIN, SCL_PIN);

  if (!display.begin(0x3C, true)) {
    Serial.println("❌ SH1106 not found");
    while (1);
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SH110X_WHITE);

  display.setCursor(0, 10);
  display.println("Insight OS Ready");
  display.display();

  Serial.println("✅ OLED ready");
}

// =======================================================
// 🖥️ DISPLAY TEXT (ROLLING TERMINAL)
// =======================================================
void showText() {
  display.clearDisplay();
  
  // Custom logic for System statuses (Center vertically)
  if (currentText.indexOf("[ System: ") >= 0) {
    display.setTextSize(1);
    
    // We want to extract just the message part if possible to center it
    String cleanMsg = currentText;
    cleanMsg.replace("[ System: ", "");
    cleanMsg.replace(" ]", "");

    // Roughly center text for 64px height display
    // Each line in Size 1 is 8px high.
    display.setCursor(0, 24); 
    display.setTextWrap(true);
    display.print(cleanMsg); // Use the cleaner version without brackets
    display.display();
    return;
  }
  
  display.setCursor(0, 0);
  
  // 🚨 Let the Adafruit library handle the word wrapping for us!
  display.setTextWrap(true); 

  // A 128x64 OLED with Size 1 text fits roughly 21 characters across and 8 lines down.
  // 21 * 8 = 168 maximum characters. We cap it at 160 to be safe.
  int maxChars = 160;

  // If the sentence is longer than the screen, slice off the oldest words
  // so the text seamlessly "scrolls" upwards!
  if (currentText.length() > maxChars) {
    currentText = currentText.substring(currentText.length() - maxChars);
  }

  display.print(currentText);
  display.display();
}

// =======================================================
// 🔌 WEBSOCKET EVENT
// =======================================================
void webSocketEvent(uint8_t client, WStype_t type,
                    uint8_t * payload, size_t length) {

  switch(type) {

    case WStype_CONNECTED:
      Serial.println("✅ WS Client Connected");
      connectedClient = client;
      wsConnected = true;
      break;

    case WStype_DISCONNECTED:
      Serial.println("❌ WS Disconnected");
      connectedClient = 255;
      wsConnected = false;
      break;

    case WStype_TEXT: {
      String msg = String((char*)payload);
      
      // Clear before processing to clear previous commands if needed. 
      // If we are getting real text but had a system status, we want to clear the system status.
      // Easiest is: if it's the start of a response/text, and currentText has "System", just wipe it.
      if (currentText.indexOf("[ System:") >= 0) {
         currentText = "";
      }
      
      if (msg == "CMD:CLEAR") {
        currentText = "";
      } else if (msg.indexOf("[ System:") >= 0) {
        // Just directly show system status (overwrites previous text)
        currentText = msg;
      } else {
        // If we currently have a system status, clear it before starting new AI text
        if (currentText.indexOf("[ System:") >= 0) {
          currentText = "";
        }
        currentText += msg; 
      }

      showText();
      break;
    }
  }
}

// =======================================================
// SETUP
// =======================================================
void setup() {
  Serial.begin(115200);
  
  delay(3000); 

  Serial.println("\n\n--- ESP32-C3 BOOTING ---");
  connectWiFi();
  udp.begin(12345);

  setupDisplay();

  webSocket.begin();
  webSocket.onEvent(webSocketEvent);

  Serial.println("🚀 Display Node Ready");
}

// =======================================================
// LOOP
// =======================================================
void loop() {
  webSocket.loop();
  broadcastPresence();
  delay(10);
} 
