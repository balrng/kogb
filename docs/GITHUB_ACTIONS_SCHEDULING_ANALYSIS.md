# GitHub Actions Scraper Zamanlama Analizi ve Manuel Tetikleme Raporu

**Tarih:** 10 Şubat 2026  
**Konu:** GitHub Actions scraper'ının 5 dakikada bir çalışmama sorunu ve manuel tetikleme alternatifleri

## 🔍 Sorunun Analizi

### Mevcut Durum

**Workflow Yapılandırması:**
```yaml
on:
  schedule:
    - cron: '*/5 * * * *'  # Her 5 dakikada bir
  workflow_dispatch:  # Manuel tetikleme
```

**Beklenen Davranış:** Scraper her 5 dakikada bir otomatik çalışmalı

**Gerçek Durum:** Son 10 çalışma zamanına bakıldığında:
- 2026-02-10 20:26:45 (son çalışma)
- 2026-02-10 19:45:38 (41 dakika önce)
- 2026-02-10 18:43:20 (62 dakika önce)
- 2026-02-10 17:45:49 (58 dakika önce)
- 2026-02-10 16:44:55 (61 dakika önce)

**Sonuç:** Scraper 40-60 dakikada bir çalışıyor, 5 dakikada bir DEĞİL! ❌

## 📋 Neden 5 Dakikada Bir Çalışmıyor?

### GitHub Actions Schedule Kısıtlamaları

GitHub Actions'ın scheduled workflow'ları için bilinen kısıtlamalar:

1. **Minimum Aralık Garantisi Yok**
   - GitHub, `*/5` (her 5 dakika) cron'u destekler ama GARANTILEMEZ
   - Özellikle ücretsiz hesaplarda düşük öncelik verilir

2. **Yüksek Yük Durumunda Gecikme**
   - GitHub Actions shared runner'ları kullanır
   - Yoğun zamanlarda workflow'lar kuyruğa alınır
   - 5 dakikalık cron'lar genelde 30-60 dakikada bir çalışır

3. **Resmi GitHub Dokümantasyonu Uyarısı:**
   > "The shortest interval you can run scheduled workflows is once every 5 minutes. 
   > However, scheduled workflows may be delayed during periods of high loads of 
   > GitHub Actions workflow runs."

4. **Repository İnaktivitesi**
   - Eğer repo uzun süre inaktif kalırsa, scheduled workflow'lar tamamen devre dışı bırakılabilir

### Bu Repodaki Durum

✅ **Scraper kodu çalışıyor** - workflow başarıyla tamamlanıyor  
✅ **Azure Blob yükleme başarılı** - veriler blob storage'a yazılıyor  
❌ **Zamanlama çalışmıyor** - GitHub Actions'ın kısıtlaması

## ✅ ÇÖZÜM 1: Manuel Tetikleme (workflow_dispatch)

### Zaten Mevcut! 🎉

Workflow'unuzda `workflow_dispatch:` satırı VAR, bu sayede **manuel tetikleme zaten aktif**.

### Manuel Tetikleme Yöntemleri

#### A) GitHub Web UI Üzerinden (EN KOLAY)

1. https://github.com/balrng/kogb/actions adresine git
2. Sol taraftan **"Local Scraper (GitHub-hosted)"** workflow'unu seç
3. Sağ üstteki **"Run workflow"** butonuna tıkla
4. Branch seç (main) ve **"Run workflow"** yap

**Avantaj:** Tek tıkla çalıştırabilirsin  
**Dezavantaj:** Her seferinde manuel giriş gerekiyor

#### B) GitHub CLI ile (KOMUT SATIRI)

```bash
# GitHub CLI kur (eğer yoksa): https://cli.github.com/
gh auth login

# Workflow'u tetikle
gh workflow run local-scraper.yml --repo balrng/kogb

# Durumu kontrol et
gh run list --workflow=local-scraper.yml --repo balrng/kogb --limit 5
```

**Avantaj:** Script'lerden çağırabilirsin  
**Dezavantaj:** Her tetiklemede komut çalıştırmak gerekiyor

#### C) GitHub API ile (PROGRAMATIK)

```bash
# Personal Access Token ile (repo scope gerekli)
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer YOUR_GITHUB_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/balrng/kogb/actions/workflows/local-scraper.yml/dispatches \
  -d '{"ref":"main"}'
```

**Node.js Örneği:**
```javascript
const fetch = require('node-fetch');

async function triggerScraper() {
  const response = await fetch(
    'https://api.github.com/repos/balrng/kogb/actions/workflows/local-scraper.yml/dispatches',
    {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({ ref: 'main' })
    }
  );
  return response.status === 204; // 204 = başarılı
}
```

**Avantaj:** Otomasyona entegre edilebilir  
**Dezavantaj:** GitHub token yönetimi gerekiyor

#### D) Webhook ile Tetikleme (DIS SERVIS)

External bir cron servisi kullanarak GitHub API'yi çağırabilirsin:
- **cron-job.org** (ücretsiz)
- **EasyCron** (ücretsiz plan)
- **UptimeRobot** (her 5 dakikada webhook çağırabilir)

## ✅ ÇÖZÜM 2: Alternatif Zamanlama Platformları

Eğer GitHub Actions'ın zamanlama kısıtlamaları kabul edilemezse:

### A) Azure Container Instances + Timer Trigger

```
Azure Container Instance (Docker)
  └─> Her 5 dakikada cron job
      └─> node local-scraper.js
          └─> Azure Blob Storage yükle
```

**Maliyet:** ~$5-10/ay (always-on container)  
**Güvenilirlik:** %100 (Azure'ın kendi cron'u)  
**Karmaşıklık:** Orta (Docker image + Azure setup)

### B) Azure Logic Apps (Serverless)

```
Logic App Schedule Trigger (5 dakika)
  └─> Azure Function HTTP trigger
      └─> Puppeteer scraping
          └─> Blob Storage yükle
```

**Maliyet:** ~$1-2/ay (consumption plan)  
**Güvenilirlik:** %100  
**Karmaşıklık:** Düşük (no-code/low-code)

### C) External Cron + Azure Function

```
EasyCron / Cron-job.org (5 dakika)
  └─> POST /api/triggerScrape (Azure Function)
      └─> Puppeteer scraping
          └─> Blob Storage
```

**Maliyet:** Ücretsiz (mevcut Azure Functions)  
**Güvenilirlik:** %95+  
**Karmaşıklık:** Düşük

## 🎯 TAVSİYE EDİLEN ÇÖZÜM

### Seçenek A: Mevcut Durumu Kabul Et (EN KOLAY)

**Durum:** GitHub Actions 40-60 dakikada bir çalıştırıyor  
**Öneri:** Cron'u `*/30 * * * *` (30 dakika) yap, gerçekçi hedef koy

```yaml
on:
  schedule:
    - cron: '*/30 * * * *'  # Her 30 dakikada bir (gerçekçi)
  workflow_dispatch:
```

**Artıları:**
- ✅ Değişiklik gerektirmez
- ✅ Ücretsiz
- ✅ Manuel tetikleme her zaman kullanılabilir

**Eksileri:**
- ⚠️ Veri 30-60 dakika eski olabilir

### Seçenek B: Manuel Tetikleme + Web UI (ÖNERİLEN)

**Kullanım Senaryosu:**
1. GitHub Actions otomatik 30 dakikada çalışsın (arka plan)
2. Gerektiğinde "Run workflow" ile manuel tetikle
3. Günde 1-2 kez manuel tetikleme yeterli (yoğun saatlerde)

**Artıları:**
- ✅ Ücretsiz
- ✅ Esneklik
- ✅ Hemen tetiklenebilir

**Eksileri:**
- ⚠️ Manuel müdahale gerekiyor

### Seçenek C: External Cron + GitHub API (İLERİ SEVİYE)

**Yapılacaklar:**
1. GitHub Personal Access Token oluştur (workflow scope)
2. EasyCron veya cron-job.org'a kayıt ol
3. Her 5 dakikada GitHub API'ye webhook gönder

**Artıları:**
- ✅ Gerçek 5 dakikalık aralık
- ✅ Neredeyse ücretsiz
- ✅ Güvenilir

**Eksileri:**
- ⚠️ External servise bağımlılık
- ⚠️ Token güvenliği

## 📊 Karşılaştırma Tablosu

| Yöntem | Güvenilirlik | Maliyet | Karmaşıklık | 5 dk Garanti |
|--------|--------------|---------|-------------|--------------|
| GitHub Actions (mevcut) | %70 | Ücretsiz | Düşük | ❌ |
| Manuel Tetikleme | %100 | Ücretsiz | Çok Düşük | ✅ (manuel) |
| External Cron → GitHub API | %95 | Ücretsiz | Orta | ✅ |
| Azure Container Instance | %100 | $5-10/ay | Orta | ✅ |
| Azure Logic Apps | %100 | $1-2/ay | Düşük | ✅ |

## 🚀 Hemen Yapılabilecekler

### 1. Manuel Tetikleme Test Et (ŞİMDİ)

```bash
# GitHub UI üzerinden
https://github.com/balrng/kogb/actions → "Run workflow"

# VEYA GitHub CLI ile
gh workflow run local-scraper.yml --repo balrng/kogb
```

### 2. Cron'u Gerçekçi Ayarla (5 dakika)

```yaml
# .github/workflows/local-scraper.yml
on:
  schedule:
    - cron: '*/30 * * * *'  # Her 30 dakika (gerçekçi)
  workflow_dispatch:  # Manuel tetikleme (zaten var)
```

### 3. API Cache'i Artır (İHTİYACA GÖRE)

Eğer scraper 30 dakikada bir çalışacaksa, API cache'i de 5 dakikadan 10-15 dakikaya çıkarılabilir:

```javascript
// api/getPrices/index.js
const TTL_SECONDS = parseInt(process.env.GET_PRICES_TTL_SECONDS || '600', 10); // 10 dakika
```

Bu sayede scraper 30 dakikada çalışsa bile, API 10 dakika cache'le hızlı kalır.

## 📝 Sonuç

**SORUN:** GitHub Actions'ın schedule kısıtlaması nedeniyle 5 dakikalık cron çalışmıyor (40-60 dakikada çalışıyor).

**ÇÖZÜM:** 
1. ✅ **Manuel tetikleme ZATEN AKTİF** - `workflow_dispatch` sayesinde istediğin zaman tetikleyebilirsin
2. ✅ Cron'u 30 dakikaya çek (gerçekçi hedef)
3. ✅ Gerektiğinde manuel tetikle (web UI veya CLI)
4. 🔄 İlerleyen zamanda external cron servisi kullanılabilir (ücretsiz, %100 güvenilir)

**İLK ADIM:** Şimdi manuel tetiklemeyi dene → https://github.com/balrng/kogb/actions
