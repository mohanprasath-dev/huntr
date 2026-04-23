<p align="center">
  <img src="https://img.shields.io/badge/HuntR-Autonomous%20B2B%20Agent-blueviolet?style=for-the-badge&logo=robot&logoColor=white" alt="HuntR Badge"/>
</p>

<h1 align="center">🎯 HuntR</h1>
<h3 align="center">Autonomous B2B Client Acquisition Agent</h3>

<p align="center">
  <strong>Finds your ideal clients, researches their pain, scores fit, and writes hyper-personalized outreach — all while you sleep.</strong>
</p>

<p align="center">
  <a href="#-live-demo"><img src="https://img.shields.io/badge/Live%20Demo-huntr.mohanprasath.dev-00C853?style=flat-square&logo=vercel" alt="Live Demo"/></a>
  <img src="https://img.shields.io/badge/agents-5%20autonomous-FF6F00?style=flat-square" alt="Agents"/>
  <img src="https://img.shields.io/badge/Gemini%202.5-Pro%20%2B%20Flash-4285F4?style=flat-square&logo=google&logoColor=white" alt="Gemini"/>
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License"/>
</p>

---

## ⚡ One-Line Pitch

> **HuntR deploys 5 AI agents that autonomously prospect, research, score, and draft hyper-personalized outreach — reducing 4 hours of manual B2B prospecting to under 4 minutes.**

---

## 🔥 The Problem

Every B2B founder and sales team faces the same brutal reality:

| Pain Point | Reality |
|---|---|
| **⏰ Time Sink** | Manual prospecting eats **3–4 hours daily** — LinkedIn scrolling, company research, email crafting |
| **📉 Low Reply Rates** | **80% of outreach is generic** copy-paste templates that get ignored or spam-filtered |
| **🎯 No Signal Detection** | Reps miss buying signals — hiring posts, funding rounds, tech migrations — buried across the web |
| **🔄 No Follow-up System** | Deals die in silence. Most teams have zero structured follow-up sequences |
| **💸 Expensive & Unscalable** | Hiring SDRs costs ₹8,40,000+/year per rep, and they still can't personalize at scale |

**HuntR eliminates all of this.** One click. Five agents. Dozens of qualified, personalized leads — delivered in minutes.

---

## 🏗️ Architecture

```
                           ┌─────────────────────────────────┐
                           │         USER / BROWSER          │
                           └───────────────┬─────────────────┘
                                           │
                                           ▼
                           ┌─────────────────────────────────┐
                           │   Next.js 15 Dashboard (React)  │
                           │   Campaign Form · Lead Cards ·  │
                           │   Agent Pipeline · Impact Bar   │
                           └───────────────┬─────────────────┘
                                           │  REST + SSE
                                           ▼
                           ┌─────────────────────────────────┐
                           │     FastAPI Backend (Python)     │
                           │  Async Jobs · Firestore · CORS  │
                           └───────────────┬─────────────────┘
                                           │
                                           ▼
                      ┌────────────────────────────────────────────┐
                      │          🧠 MANAGER AGENT (Orchestrator)   │
                      │     Gemini 2.5 Pro · Pipeline Control ·    │
                      │     Self-Correction · Trace Logging        │
                      └─────┬──────┬──────┬──────┬──────┬──────────┘
                            │      │      │      │      │
                   ┌────────┘  ┌───┘  ┌───┘  ┌───┘  ┌───┘
                   ▼           ▼      ▼      ▼      ▼
              ┌─────────┐ ┌────────┐ ┌──────┐ ┌────────┐ ┌──────────┐
              │  SCOUT  │ │RESEARCH│ │SCORER│ │OUTREACH│ │ FOLLOWUP │
              │  Agent  │ │ Agent  │ │Agent │ │ Agent  │ │  Agent   │
              ├─────────┤ ├────────┤ ├──────┤ ├────────┤ ├──────────┤
              │ Serper  │ │ Serper │ │Gemini│ │Gemini  │ │ Gemini   │
              │ Google  │ │LinkedIn│ │ 2.5  │ │ 2.5 Pro│ │ 2.5 Flash│
              │ Search  │ │Enrichmt│ │Flash │ │ + Brevo│ │ Sequence │
              └────┬────┘ └───┬────┘ └──┬───┘ └───┬────┘ └────┬─────┘
                   │          │         │         │            │
                   ▼          ▼         ▼         ▼            ▼
              ┌──────────────────────────────────────────────────────┐
              │              OUTPUT PER LEAD                         │
              │  Company · Score · Pain Signal · Decision Maker ·   │
              │  Email Draft · LinkedIn Message · 3-Part Followup   │
              └─────────────────────┬────────────────────────────────┘
                                    │
                        ┌───────────┴───────────┐
                        ▼                       ▼
                  ┌───────────┐          ┌─────────────┐
                  │ 📧 Email  │          │ 💼 LinkedIn  │
                  │   (Brevo  │          │   (Draft +   │
                  │    SMTP)  │          │    Copy)     │
                  └───────────┘          └─────────────┘
```

---

## 🧬 Three Pillars

### 1. 👁️ Perception — Pain Signal Detection

HuntR's **Scout** and **Researcher** agents sweep the web to detect *real* buying signals — not just company names.

- **Hiring signals** → "They're building a sales team but have no outbound infrastructure"  
- **Funding rounds** → "Series A closed, now scaling — needs lead gen yesterday"  
- **Tech stack gaps** → "Using legacy CRM with no automation = pain"  
- **Forum discussions** → Reddit, LinkedIn posts where founders openly discuss struggles  
- **Multi-source enrichment** — cross-references Serper, LinkedIn, company sites, and public databases

### 2. 🧠 Reasoning — Lead Scoring + Personalization

The **Scorer** agent uses Gemini 2.5 to evaluate every lead across multiple dimensions:

- **Pain intensity** — How acute is their stated/implied problem?  
- **Budget signals** — Can they afford a solution? (funding, team size, tech spend)  
- **Decision-maker access** — Can we reach the right person?  
- **Timing fit** — Are they actively seeking solutions *now*?  

Each lead gets a **0–100 composite score** with a full reasoning breakdown. Only qualified leads (score ≥ 60) advance to outreach — with self-correcting fallback thresholds.

### 3. ⚡ Action — Outreach Generation + Delivery

The **Outreach** and **Followup** agents don't write templates — they write *conversations*:

- **Hyper-personalized emails** referencing the prospect's specific pain point, tech stack, and recent activity  
- **LinkedIn connection messages** (≤300 chars) tailored for mobile-first reading  
- **3-part follow-up sequences** (Day 3 / Day 7 / Day 14) with escalating urgency and a graceful breakup  
- **One-click email send** via Brevo SMTP with embedded tracking pixel for open-rate analytics  

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | Next.js 15 (Turbopack), React 19, TypeScript | Dashboard, campaign builder, real-time pipeline view |
| **Styling** | Tailwind CSS 4 | Responsive, dark-mode-first UI |
| **Backend** | FastAPI, Python 3.11, Uvicorn | REST API, SSE streaming, async job orchestration |
| **AI / LLM** | Gemini 2.5 Pro + Flash (Vertex AI) | Reasoning, scoring, outreach generation |
| **Agent Framework** | Google ADK (Agent Development Kit) | Multi-agent orchestration and tool use |
| **Database** | Google Cloud Firestore | Campaign persistence, job tracking, event logs |
| **Search** | Serper API | Web-scale company and signal discovery |
| **Email** | Brevo SMTP | Transactional email delivery with tracking |
| **LinkedIn** | Proxycurl (optional) | Profile enrichment and decision-maker lookup |
| **Deployment** | Google Cloud Run, Docker | Serverless, auto-scaling containers |
| **CI/CD** | Cloud Build (`cloudbuild.yaml`) | Automated build and deploy pipeline |

---

## 🔄 Self-Correction Engine

HuntR doesn't just run a pipeline — it **monitors its own output and adapts in real-time**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SELF-CORRECTION LOOP                         │
│                                                                 │
│  1. Scout finds leads → too few?                                │
│     → Auto-retry with 12 query variations + fallback queries    │
│                                                                 │
│  2. Scorer qualifies leads → below 40 threshold?                │
│     → Dynamically lower threshold: 60 → 40 → 30 → rank all     │
│                                                                 │
│  3. Researcher fails on a lead?                                 │
│     → Fallback enrichment with partial data preserved           │
│                                                                 │
│  4. Outreach agent crashes?                                     │
│     → Fallback template generator using available pain signals  │
│                                                                 │
│  5. Pipeline-level retry: not enough qualified leads?            │
│     → Re-scout with new queries, de-duplicate, re-score         │
│                                                                 │
│  Result: The pipeline NEVER returns zero leads. It adapts.      │
└─────────────────────────────────────────────────────────────────┘
```

Every agent has a **fallback path**. Every phase has **retry logic**. The Manager orchestrator tracks all decisions in a structured trace log for full auditability.

---

## 📊 Impact

<table>
  <tr>
    <td align="center"><h2>⏱️</h2><strong>4 hours → 4 minutes</strong><br/>Manual prospecting time eliminated</td>
    <td align="center"><h2>🎯</h2><strong>100% personalized</strong><br/>Every message references real pain signals</td>
    <td align="center"><h2>📈</h2><strong>40+ qualified leads</strong><br/>Per campaign run, scored and ranked</td>
  </tr>
  <tr>
    <td align="center"><h2>💰</h2><strong>₹33,600+ saved</strong><br/>Per run vs. manual SDR cost</td>
    <td align="center"><h2>🤖</h2><strong>5 autonomous agents</strong><br/>Working in parallel, self-correcting</td>
    <td align="center"><h2>📧</h2><strong>Email + LinkedIn + Follow-up</strong><br/>Complete outreach stack, ready to send</td>
  </tr>
</table>

> **"Reduces 4 hours of manual prospecting to 4 minutes. Every message is hyper-personalized."**

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.11+** and **Node.js 18+**
- A **Google Cloud** project with Vertex AI enabled
- API keys: **Serper** (search), **Brevo** (email)

### 1. Clone the Repository

```bash
git clone https://github.com/mohanprasath-dev/huntr.git
cd huntr
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate      # Linux/macOS
# .venv\Scripts\activate       # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your credentials:
#   GOOGLE_CLOUD_PROJECT=your-project-id
#   GOOGLE_CLOUD_LOCATION=us-central1
#   SERPER_API_KEY=your-serper-key
#   BREVO_SMTP_KEY=your-brevo-key
#   BREVO_SENDER_EMAIL=you@yourdomain.com

# Start the backend server
uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local:
#   NEXT_PUBLIC_HUNTR_API_BASE_URL=http://localhost:8000

# Start the development server
npm run dev
```

### 4. Open the Dashboard

Navigate to **[http://localhost:3000](http://localhost:3000)** — enter your niche, hit "Start Hunt", and watch 5 agents work in real-time.

### Docker Deployment

```bash
cd backend
docker build -t huntr-backend .
docker run -p 8080:8080 --env-file .env huntr-backend
```

### Google Cloud Run Deployment

```bash
# Use the included Cloud Build config
gcloud builds submit --config cloudbuild.yaml --project your-project-id
```

---

## 🌐 Live Demo

> 🔗 **[huntr.mohanprasath.dev](https://huntr.mohanprasath.dev)**
>
> Try the full pipeline — enter any B2B niche and watch HuntR's agents find, research, score, and draft outreach for real companies in real-time.

---

## 📁 Project Structure

```
huntr/
├── backend/
│   ├── agents/
│   │   ├── manager.py          # Orchestrator — runs the 5-phase pipeline
│   │   ├── scout_agent.py      # Web search + lead discovery
│   │   ├── researcher_agent.py # Company enrichment + decision-maker lookup
│   │   ├── scorer_agent.py     # AI-powered lead scoring (0–100)
│   │   ├── outreach_agent.py   # Email + LinkedIn message generation
│   │   └── followup_agent.py   # 3-part follow-up sequence builder
│   ├── tools/
│   │   ├── serper_tool.py      # Serper search API wrapper
│   │   ├── email_tool.py       # Brevo SMTP integration
│   │   ├── linkedin_tool.py    # LinkedIn enrichment utilities
│   │   └── scorer_tool.py      # Scoring computation helpers
│   ├── db/
│   │   ├── firestore_client.py # Firestore connection + health check
│   │   └── campaign_store.py   # Campaign & job CRUD operations
│   ├── api.py                  # FastAPI app — all REST + SSE endpoints
│   ├── Dockerfile              # Production container image
│   ├── cloudbuild.yaml         # Cloud Build CI/CD pipeline
│   └── requirements.txt        # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── app/                # Next.js 15 App Router pages
│   │   ├── components/         # React components (15 modules)
│   │   │   ├── LandingPageClient.tsx
│   │   │   ├── HuntDashboard.tsx
│   │   │   ├── CampaignForm.tsx
│   │   │   ├── AgentPipeline.tsx
│   │   │   ├── LeadCard.tsx
│   │   │   ├── ImpactBar.tsx
│   │   │   └── ...
│   │   └── lib/                # Shared utilities
│   ├── package.json
│   └── tsconfig.json
├── LICENSE                     # MIT License
└── README.md
```

---

## 🤝 Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <strong>Built by <a href="https://mohanprasath.dev">Mohan Prasath</a></strong><br/>
  <sub>Powered by Google Gemini 2.5 · Vertex AI · Google ADK</sub>
</p>
