# StreamMesh SOA — Distributed Video Streaming Microservices

A polyglot **Service-Oriented Architecture (SOA) & Microservices Backend** combining an **Express + Apollo GraphQL API Gateway**, typed **gRPC / Protocol Buffer** services, autonomous **SQLite & RxDB** datastores, and **Apache Kafka** event streaming (with automatic non-blocking fallback so the demo runs locally with or without Docker).

Includes a lightweight **Dark Broadcast Demo & Wire Console** (`streaming-app/demo-ui/`) serving as a visual developer harness over the backend APIs.

---

## Architecture Overview

```text
   [ Demo & Wire Console (:3001/demo) / Postman / GraphQL Sandbox (:4000) ]
                                    │
                        HTTP REST & Apollo GraphQL
                                    ▼
                     streaming-app/gateway/server.js
                ┌───────────────────┼───────────────────┐
          gRPC :50051         gRPC :50052         gRPC :50053
                ▼                   ▼                   ▼
         user-service        video-service     interaction-service
        (RxDB + JWT)      (SQLite + Multer)    (SQLite Comments/Likes)
                │                   │                   │
                └──────────────► Apache Kafka (:9092) ◄─┘
                 (user.created, video.uploaded, video.liked, comment.added)
```

---

## Repository Structure

```text
Video-Streaming-Microservices-SOA/
├── docs/
│   ├── Cahier de charges - Microservices.pdf
│   ├── Project_SOA_Explanation.pdf
│   ├── Simplified_Video_Streaming_Platform__Full_Project_Plan.pdf
│   ├── postman-and-links.txt
│   └── screenshots/
└── streaming-app/
    ├── demo-ui/                 # Dark Cinema Studio Developer Wire Console (/demo)
    ├── gateway/                 # Express REST (:3001) + Apollo GraphQL (:4000) Gateway
    ├── user-service/            # gRPC User & Auth Service (:50051) + RxDB + JWT
    ├── video-service/           # gRPC (:50052) + Media HTTP (:3002) + SQLite
    ├── interaction-service/     # gRPC Comments & Likes Service (:50053) + SQLite
    ├── proto/                   # Shared .proto contracts (user, video, interaction)
    ├── docker-compose.yml       # Optional Zookeeper + Kafka (:9092)
    └── start-all.ps1            # One-command local launcher (Windows PowerShell)
```

---

## Quick Start (Local Demo — Works With or Without Docker)

### 1. Install Dependencies (First Time Only)
```powershell
cd streaming-app
foreach ($s in "gateway","user-service","video-service","interaction-service") {
  Push-Location $s; npm install; Pop-Location
}
```

### 2. Optional: Start Apache Kafka via Docker
```powershell
cd streaming-app
docker compose up -d
```
*(If Docker is not running, all 4 services automatically fall back cleanly to local gRPC + SQLite mode.)*

### 3. Launch All 4 Microservices
```powershell
cd streaming-app
.\start-all.ps1
```

### 4. Open Live Endpoints
- **Dark Broadcast Wire Console (Demo UI)**: http://localhost:3001/demo
- **Apollo GraphQL Sandbox**: http://localhost:4000/
- **Mesh Health JSON**: http://localhost:3001/api/health
