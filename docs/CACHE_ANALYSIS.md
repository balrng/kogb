# KoGB API Önbellekleme (Cache) Analizi ve Öneriler

**Tarih:** 6 Şubat 2026  
**Konu:** Her requestte blob storage'a gitmemek için 5 dakikalık cache stratejisi

## 📊 Mevcut Durum Analizi

### Halihazırda Var Olan Cache Mekanizmaları

#### 1. **getPrices API** (✅ Cache Mevcut)
- **Mevcut TTL:** 30 saniye
- **Yapı:** Basit in-memory obje (`{ ts, body }`)
- **Kontrol:** `GET_PRICES_TTL_SECONDS` env değişkeni
- **Kapatma:** `DISABLE_PRICES_CACHE` env değişkeni
- **Durum:** ✅ Çalışıyor, sadece TTL artırılmalı

#### 2. **getHistory API** (✅ Cache Mevcut)
- **Mevcut TTL:** 180 saniye (3 dakika)
- **Yapı:** Map tabanlı, tarih bazlı cache
- **Kontrol:** `GET_HISTORY_TTL_SECONDS` env değişkeni
- **Kapatma:** `DISABLE_HISTORY_CACHE` env değişkeni
- **Durum:** ✅ Zaten iyi, değişiklik gerekmez

#### 3. **getConfig API** (❌ Cache YOK)
- **Mevcut TTL:** Yok - her istekte blob'a gidiyor
- **Yapı:** Cache mekanizması yok
- **Durum:** ⚠️ Cache eklenmeli

## 🎯 Önerilen Değişiklikler

### Seçenek 1: Minimal Değişiklik (ÖNERİLEN ✓)

**Neler Yapılacak:**
1. `getPrices` API'de TTL'yi 30'dan 300'e çıkar
2. `getConfig` API'ye cache ekle (300 saniye)
3. `.env.example` dosyasını güncelle

**Avantajları:**
- ✅ Mevcut yapıyı bozmaz
- ✅ Test edilmiş pattern kullanır
- ✅ Hızlı implement edilir
- ✅ Azure Functions warm instance'larda çalışır

**Dezavantajları:**
- ⚠️ Cold start'ta cache sıfırlanır (normal davranış)
- ⚠️ Her function instance'ın kendi cache'i var

### Seçenek 2: Azure Redis Cache (Gelecek için)

**Ne Zaman Kullanılmalı:**
- Birden fazla instance arasında paylaşımlı cache gerekiyorsa
- Cold start sonrası cache korunması kritikse
- Daha gelişmiş cache stratejileri gerekiyorsa

**Maliyeti:**
- Azure Redis Basic: ~$15-20/ay
- Consumption plan function'larda overkill olabilir

## 📋 Implementation Checklist

### Adım 1: getPrices TTL Güncelleme
```javascript
// api/getPrices/index.js satır 21
// DEĞİŞTİR: const TTL_SECONDS = parseInt(process.env.GET_PRICES_TTL_SECONDS || '30', 10);
// YENİ:     const TTL_SECONDS = parseInt(process.env.GET_PRICES_TTL_SECONDS || '300', 10);
```

### Adım 2: getConfig Cache Ekleme
getConfig API'ye getPrices'taki pattern'e benzer cache mantığı ekle:
- Global cache objesi tanımla
- TTL kontrolü ekle
- Env değişkeni ile kontrol ekle

### Adım 3: Environment Variables
```bash
# .env.example güncelle
GET_PRICES_TTL_SECONDS=300      # 5 dakika
GET_CONFIG_TTL_SECONDS=300      # 5 dakika (yeni)
GET_HISTORY_TTL_SECONDS=180     # 3 dakika (mevcut, değişmez)
```

### Adım 4: Azure Portal Ayarları
Production ortamında Azure Static Web App → Configuration → Application Settings:
- `GET_PRICES_TTL_SECONDS` = `300`
- `GET_CONFIG_TTL_SECONDS` = `300`

## 🔍 Test Senaryoları

1. **İlk Request:** Blob'dan veri çek, cache'e kaydet
2. **2. Request (5 dk içinde):** Cache'den dön, blob'a gitme
3. **6. Request (5 dk sonra):** Cache expire olmuş, blob'dan tekrar çek
4. **Cold Start:** Function yeniden başlayınca cache sıfırlanır (normal)

## 📈 Beklenen İyileştirmeler

### Performans:
- **İlk request:** ~500-1000ms (blob okuma)
- **Cached request:** ~50-100ms (%80-90 daha hızlı)

### Maliyet:
- Blob storage read operations: %95 azalma
- Warm instance'larda 5 dk boyunca tek blob read

### Kullanıcı Deneyimi:
- Sayfa yüklenme süresi: Daha hızlı
- Sunucu yükü: Azalır

## ⚠️ Dikkat Edilmesi Gerekenler

1. **Veri Tazeliği:** 5 dakika eski veri gösterilebilir (scraper sıklığına göre kabul edilebilir)
2. **Cold Start:** Azure Functions soğuk başlangıçta cache sıfırlanır
3. **Memory:** Cached veri memory'de tutulur (Azure'da problem olmaz)
4. **Concurrent Requests:** İlk cache miss'te birden fazla blob read olabilir (kritik değil)

## 🚀 Deployment Stratejisi

1. **Dev/Test:**
   - Önce test ortamında dene
   - Cache behavior'unu gözlemle
   - Log'ları kontrol et

2. **Production:**
   - Azure portal'dan env değişkenlerini güncelle
   - Function'ları redeploy et
   - İlk 1 saat monitoring yap

## 📊 Monitoring

### Log Kontrolleri:
```javascript
context.log(`getPrices: Returning cached response (age=${elapsedSec}s)`);
context.log(`getPrices: Downloading blob...`); // Cache miss
```

### Metrikler:
- Cache hit rate: Hedef %80+
- Average response time: Hedef <200ms
- Blob read count: Günlük %95 azalma

## 🎓 Best Practice Özeti

✅ **In-memory cache** kullan (mevcut yaklaşım doğru)  
✅ **Environment variables** ile yapılandır  
✅ **TTL** değerlerini use-case'e göre ayarla  
✅ **Disable flag** ekle (debugging için)  
✅ **Cold start** davranışını kabul et  
❌ Redis gibi external cache'e şimdilik gerek YOK  
❌ Karmaşık cache invalidation mekanizmasına gerek YOK  

## 📝 Sonuç

Mevcut sistemde zaten iyi bir cache altyapısı var. Sadece:
1. **getPrices** TTL'sini 30 → 300 saniyeye çıkarmak
2. **getConfig** API'ye aynı pattern'le cache eklemek

yeterli olacaktır. Bu değişiklikler minimal, güvenli ve Azure Functions consumption plan ile uyumludur.

---

**Hazırlayan:** GitHub Copilot AI  
**Dil:** Türkçe (Kullanıcı isteği üzerine)
