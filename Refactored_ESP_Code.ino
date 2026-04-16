#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebSocketsServer.h>
#include <base64.h> 

#include "esp_camera.h"
#include <driver/i2s.h>
#include "board_config.h" 

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
// WebSocket Server (PORT 81)
// ==========================
WebSocketsServer webSocket = WebSocketsServer(81);
uint8_t connectedClient = 255;

// ==========================
// I2S MIC
// ==========================
#define I2S_WS   32
#define I2S_SD   33
#define I2S_SCK  26

#define SAMPLE_RATE 16000
#define I2S_PORT I2S_NUM_1

#define SOUND_THRESHOLD 800
#define SILENCE_TIMEOUT 1200

bool isStream = false;
unsigned long lastSoundTime = 0;

// Task Synchronization Flags
volatile bool triggerImage = false;
volatile bool forceSleep = false;
SemaphoreHandle_t wsMutex;

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

  String payload = "{\"role\":\"camera_mic\",\"ip\":\"" + WiFi.localIP().toString() + "\"}";
  udp.beginPacket(WiFi.broadcastIP(), 12345);
  udp.print(payload);
  udp.endPacket();

  Serial.println("📡 Broadcasting: " + payload);
}

// =======================================================
// 📷 CAMERA
// =======================================================
void setupCamera() {
  camera_config_t config;

  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;

  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;

  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;

  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;

  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;

  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  
  config.frame_size   = FRAMESIZE_VGA; 
  config.jpeg_quality = 12;            
  config.fb_count     = 2;
  config.fb_location  = CAMERA_FB_IN_PSRAM;

  if (esp_camera_init(&config) != ESP_OK) {
    Serial.println("❌ Camera failed");
    while (1);
  }

  sensor_t * s = esp_camera_sensor_get();
  if (s != NULL) {
    s->set_brightness(s, 0);       
    s->set_contrast(s, 0);         
    s->set_saturation(s, 0);       
    s->set_special_effect(s, 0);   
    s->set_whitebal(s, 1);         
    s->set_awb_gain(s, 1);         
    s->set_wb_mode(s, 0);          
    s->set_exposure_ctrl(s, 1);    
    s->set_aec2(s, 0);             
    s->set_ae_level(s, 0);         
    s->set_gain_ctrl(s, 1);        
    s->set_gainceiling(s, GAINCEILING_128X); 
    s->set_bpc(s, 0);              
    s->set_wpc(s, 0);              
    s->set_raw_gma(s, 1);          
    s->set_lenc(s, 1);             
    s->set_hmirror(s, 1);          
    s->set_vflip(s, 1);            
    s->set_dcw(s, 1);              
    s->set_colorbar(s, 0);         
  }
  Serial.println("✅ Camera ready");
}

// =======================================================
// 🎤 MIC
// =======================================================
void setupMic() {
  i2s_config_t config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S_MSB,
    .intr_alloc_flags = ESP_INTR_FLAG_LOWMED,
    .dma_buf_count = 8,   // 🚨 FIX: Increased from 6 to 8 to buffer CPU spikes
    .dma_buf_len = 512    // 🚨 FIX: Increased from 128 to 512 for stability
  };

  i2s_pin_config_t pins = {
    .bck_io_num = I2S_SCK,
    .ws_io_num  = I2S_WS,
    .data_out_num = -1,
    .data_in_num  = I2S_SD
  };

  i2s_driver_install(I2S_PORT, &config, 0, NULL);
  i2s_set_pin(I2S_PORT, &pins);
  i2s_start(I2S_PORT);

  Serial.println("✅ Mic ready");
}

// 🚨 MOVE: This is now called from loop() (Core 1), NOT soundTask (Core 0)!
void sendImage() {
  if (connectedClient == 255) return;

  camera_fb_t *fb = NULL;

  for (int i = 0; i < 2; i++) {
    fb = esp_camera_fb_get();
    if (fb) esp_camera_fb_return(fb);
  }

  fb = esp_camera_fb_get();
  if (!fb) return;

  String encoded = base64::encode(fb->buf, fb->len);
  
  // 🚨 FAST NEWLINE STRIP (Prevents slow heap re-allocations)
  int j = 0;
  for (unsigned int i = 0; i < encoded.length(); i++) {
    if (encoded[i] != '\n' && encoded[i] != '\r') {
      encoded[j++] = encoded[i];
    }
  }
  encoded.remove(j);
  
  String payload = "IMG:" + encoded; // String addition here is okay since it's just a prefix
  
  if (xSemaphoreTake(wsMutex, portMAX_DELAY) == pdTRUE) {
    webSocket.sendTXT(connectedClient, payload);
    xSemaphoreGive(wsMutex);
  }
  
  esp_camera_fb_return(fb);
}


void sendAudioChunk(uint8_t* data, size_t len) {
  if (connectedClient == 255) return;
  
  String encoded = base64::encode(data, len);
  
  // 🚨 FAST NEWLINE STRIP (Prevents fragmentation pushing high latency!)
  int j = 0;
  for (unsigned int i = 0; i < encoded.length(); i++) {
    if (encoded[i] != '\n' && encoded[i] != '\r') {
      encoded[j++] = encoded[i];
    }
  }
  encoded.remove(j);
  
  String payload = "AUD:" + encoded;
  
  if (xSemaphoreTake(wsMutex, portMAX_DELAY) == pdTRUE) {
    webSocket.sendTXT(connectedClient, payload);
    xSemaphoreGive(wsMutex);
  }
}

// =======================================================
// 🔊 SOUND TASK (WAKE WORD STATE MACHINE)
// =======================================================
void soundTask(void *param) {
  int16_t samples[512]; // Increased sample buffer to match DMA chunk size
  size_t bytes_read;
  
  // 🚨 FIX: Halved the flush buffer size (3072 -> 1536) = Pushes Audio Twice As Fast!
  const size_t MAX_BUFFER_SIZE = 1536; 
  uint8_t micBuffer[MAX_BUFFER_SIZE];
  size_t micBufferLen = 0;

  bool isAwake = false;
  unsigned long lastActivityTime = 0;
  unsigned long lastImageTime = 0;
  unsigned long wakeTime = 0;
  int imagesSent = 0;

  const uint32_t WAKE_THRESHOLD = 500;
  const uint32_t ACTIVE_THRESHOLD = 200;
  const unsigned long SLEEP_TIMEOUT = 60000; // 60 seconds to prevent early drops mid-conversation

  while (!wsConnected) { delay(100); }

  Serial.println("\n🛑 [STATE] IDLE. Waiting for Wake Word...");

  while (true) {
    i2s_read(I2S_PORT, samples, sizeof(samples), &bytes_read, portMAX_DELAY);
    // Even out bytes_read to complete pairs of bytes
    if (bytes_read % 2 != 0) bytes_read--; 

    int count = bytes_read / 2;
    uint32_t sum = 0;
    for (int i = 0; i < count; i++) sum += abs(samples[i]);
    uint32_t level = sum / count;

    // ---------------------------------------------------------
    // STATE 1: IDLE (Waiting for Wake Word)
    // ---------------------------------------------------------
    if (!isAwake) {
      if (level > WAKE_THRESHOLD) {
        Serial.println("\n⏰ [STATE] WAKE WORD DETECTED! Connecting to Gemini...");
        isAwake = true;
        imagesSent = 0;
        
        wakeTime = millis();
        lastActivityTime = millis();
        lastImageTime = millis();
        micBufferLen = 0; 
        
        if (xSemaphoreTake(wsMutex, portMAX_DELAY) == pdTRUE) {
          webSocket.sendTXT(connectedClient, "CMD:WAKE");
          xSemaphoreGive(wsMutex);
        }
      }
    }

    // ---------------------------------------------------------
    // STATE 2: AWAKE (Streaming Data)
    // ---------------------------------------------------------
    if (isAwake) {
      
      // 🚨 FIX: Only SET A FLAG to trigger the image capture. 
      // Do NOT run the slow camera capture on the Sound CPU Core!
      if (imagesSent < 3 && (millis() - wakeTime > 1500) && (millis() - lastImageTime > 1000)) {
        triggerImage = true; 
        imagesSent++;
        lastImageTime = millis();
        Serial.printf("📸 Triggered Image %d/3.\n", imagesSent);
      }

      if (micBufferLen + bytes_read >= MAX_BUFFER_SIZE) {
        size_t spaceLeft = MAX_BUFFER_SIZE - micBufferLen;
        memcpy(micBuffer + micBufferLen, (uint8_t*)samples, spaceLeft);
        
        sendAudioChunk(micBuffer, MAX_BUFFER_SIZE);
        
        size_t overflow = bytes_read - spaceLeft;
        memcpy(micBuffer, (uint8_t*)samples + spaceLeft, overflow);
        micBufferLen = overflow;
      } else {
        memcpy(micBuffer + micBufferLen, (uint8_t*)samples, bytes_read);
        micBufferLen += bytes_read;
      }

      if (level > ACTIVE_THRESHOLD) {
        lastActivityTime = millis();
      }

      // Terminate conversation after silence or forced sleep
      if (forceSleep || (millis() - lastActivityTime > SLEEP_TIMEOUT)) {
        if (forceSleep) {
          Serial.println("\n💤 [STATE] Forced Sleep Requested. Going to Sleep.");
          forceSleep = false;
        } else {
          Serial.println("\n💤 [STATE] Conversation Ended (Silence). Going to Sleep.");
          if (xSemaphoreTake(wsMutex, portMAX_DELAY) == pdTRUE) {
            webSocket.sendTXT(connectedClient, "CMD:SLEEP");
            xSemaphoreGive(wsMutex);
          }
        }
        isAwake = false;
      }
    }
  }
}
// =======================================================
// 🔌 WEBSOCKET EVENTS
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
      // Null-terminate explicitly just to be safe if payload isn't
      // msg = msg.substring(0, length);
      if (msg.startsWith("CMD:CAPTURE")) {
        Serial.println("📸 App Requested Image Capture!");
        triggerImage = true;
      } else if (msg.startsWith("CMD:SLEEP")) {
        Serial.println("💤 App Requested Module Sleep!");
        forceSleep = true;
      }
      break;
    }
  }
}

// =======================================================
// SETUP
// =======================================================
void setup() {

  Serial.begin(115200);

  wsMutex = xSemaphoreCreateMutex();

  connectWiFi();
  udp.begin(12345);

  setupCamera();
  setupMic();

  webSocket.begin();
  webSocket.onEvent(webSocketEvent);

  xTaskCreatePinnedToCore(
    soundTask,
    "soundTask",
    16384, // 🚨 FIX: Bumped stack size heavily to accommodate massive buffers
    NULL,
    1,
    NULL,
    0 // 🚨 FIX: Pinnned to Core 0 (Loop and WiFi usually run heavily on Core 1)
  );

  Serial.println("🚀 Vision/Audio Node Ready");
}

// =======================================================
// LOOP
// =======================================================
void loop() {

  webSocket.loop();
  broadcastPresence();

  // 🚨 FIX: Process the camera operations strictly inside the Main Core (Core 1)
  if (triggerImage) {
    sendImage();
    triggerImage = false;
  }

  delay(10);
}
