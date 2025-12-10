# LifeOS

Plateforme personnelle de quantified self inspirée de Notion. LifeOS centralise nutrition, sport, métriques corporelles, finances, réseau social, gestion de projets et planification sur un seul espace auto-hébergé. L’application est découpée en un frontend React + TypeScript (Vite, Tailwind, shadcn/ui) et un backend Node.js + Express utilisant Prisma sur PostgreSQL. Le tout est orchestré par Docker Compose et peut être exposé derrière Nginx + Certbot.

## Sommaire

1. [Tech stack](#tech-stack)  
2. [Fonctionnalités](#fonctionnalités)  
3. [Structure du dépôt](#structure-du-dépôt)  
4. [Configuration requise](#configuration-requise)  
5. [Variables d’environnement](#variables-denvironnement)  
6. [Installation et développement local](#installation-et-développement-local)  
7. [Déploiement Docker](#déploiement-docker)  
8. [Intégration Google Calendar](#intégration-google-calendar)  
9. [Tests, lint et formatage](#tests-lint-et-formatage)  
10. [Sauvegardes et maintenance](#sauvegardes-et-maintenance)

## Tech stack

- **Frontend :** React 18 + TypeScript, Vite, TailwindCSS, shadcn/ui, Framer Motion, React Query, Recharts.  
- **Backend :** Node.js + Express, Prisma ORM, Luxon, Zod, Google APIs.  
- **Base de données :** PostgreSQL 15.  
- **Infra :** Docker Compose, Nginx (reverse proxy) + Certbot, volumes persistants (`database`, `uploads`).  
- **Auth :** JWT signé côté backend, stockage côté frontend en `localStorage`.  
- **CI locale :** PNPM pour la gestion des dépendances, ESLint + Prettier.

## Fonctionnalités

- **Nutrition :** gestion de recettes (macros auto-calculées), meal plan hebdomadaire, garde-manger, liste de courses éditable, suivi des repas journaliers et synchronisation stocks ↔ consommations.  
- **Sport :** templates Upper/Lower issus du programme Lucas Gouiffès, enregistrement des séances, volume et RPE par série, graphiques d’évolution, ajustement manuel des répétitions, import automatique des pas Google Fit avec objectif quotidien.  
- **Metrics :** mensurations, poids, IMC, variation hebdomadaire/mensuelle, upload photo (volume `/uploads`), comparaisons photo.  
- **Finances :** revenus/dépenses/épargne/investissements, catégorisation, graphiques de répartition et de trend.  
- **Social :** carnet de contacts, fréquence de suivi, rappels des personnes à recontacter, historique d’interactions (CRUD complet).  
- **Projects :** gestion multi-projets, kanban (À faire / En cours / Terminé), progression automatique, dates limites.  
- **Dashboard** : synthèse des modules (poids, calories, finances, projets, relances sociales).  
- **Planner :** connexion Google Calendar (OAuth2), création d’événements directement depuis LifeOS avec choix date/heure/durée/fuseau.

## Structure du dépôt

```
lifeos/
├── client/            # Vite + React + TS + Tailwind + shadcn/ui (SPA)
├── server/            # Express + Prisma + JWT + Google Calendar
├── database/          # Volume persistant Postgres (docker)
├── nginx/             # Reverse proxy + configuration Certbot
└── docker-compose.yml # Orchestration des services
```

## Configuration requise

- Node.js 20 et PNPM (≥ 8) pour le développement local.  
- Docker 24+ et Docker Compose plugin pour le déploiement.  
- OpenSSL (génération `ssl-dhparams.pem`).  
- Compte Google Cloud avec API Calendar activée pour la fonctionnalité Planner.

## Variables d’environnement

Créer un fichier `server/.env` (copier depuis le bloc ci-dessous) :

```env
DATABASE_URL=postgres://lifeos:lifeos@db:5432/lifeos
JWT_SECRET=change-me
PORT=4000
UPLOAD_DIR=/uploads
APP_BASE_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
```

> `UPLOAD_DIR` doit pointer vers un dossier accessible par le conteneur backend (`/uploads` dans Docker).  
> `APP_BASE_URL` est utilisé pour générer les URL de callback OAuth et pour les emails éventuels.  
> Les variables Google sont optionnelles : renseignez-les uniquement si l’intégration Planner est activée.

Pour le frontend, les appels API sont gérés via un proxy `/api`. Si vous souhaitez cibler une URL différente, créez `client/.env` :

```env
VITE_API_URL=http://localhost:4000/api
```

## Installation et développement local

```bash
# 1. Installer les dépendances
cd client && pnpm install
cd ../server && pnpm install

# 2. Générer le client Prisma
pnpm prisma generate

# 3. Lancer les serveurs de développement
pnpm dev        # dans client/
pnpm dev        # dans server/ (port 4000)
```

Prisma nécessite une base Postgres accessible : soit via Docker (`docker compose up db`), soit via une instance locale. Pour appliquer les migrations côté dev :

```bash
cd server
pnpm prisma migrate dev
```

L’interface est disponible sur `http://localhost:3000`, l’API sur `http://localhost:4000`. Ajustez `VITE_API_URL` si nécessaire.

## Déploiement Docker

```bash
# Générer les paramètres Diffie-Hellman pour Nginx (recommandé)
openssl dhparam -out nginx/ssl-dhparams.pem 2048

# Construire et lancer les services
docker compose up -d --build

# Appliquer les migrations Prisma à l’intérieur du conteneur backend
docker compose run --rm backend npx prisma migrate deploy
```

Services exposés :

- `frontend` → `:3000` (SPA servie par Vite en mode preview).  
- `backend` → `:4000` (API REST Express).  
- `db` → `:5432` (PostgreSQL 15).  
- `nginx` (profil `proxy`) → `:80/:443`, reverse proxy + Certbot.  
- Volumes persistants : `database` (données Postgres) et `uploads` (photos & fichiers).

### HTTPS et Nginx

1. Adapter `nginx/nginx.conf` avec votre domaine.  
2. Monter le profil proxy : `docker compose --profile proxy up -d nginx`.  
3. Générer/renouveler les certificats via le conteneur Certbot (`docker compose --profile proxy run --rm certbot certonly ...`).  
4. Recharger Nginx si nécessaire (`docker compose --profile proxy exec nginx nginx -s reload`).

## Intégration Google Calendar

1. Créer un projet Google Cloud, activer l’API Calendar et générer un identifiant OAuth 2.0 (type application web).  
2. Définir les redirections autorisées : `https://<votre-domaine>/api/planner/oauth/callback`.  
3. Renseigner `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` dans `server/.env`, ainsi que `APP_BASE_URL`.  
4. Redémarrer le backend (`docker compose up -d --build backend`).  
5. Depuis LifeOS → Planner, cliquer sur « Connecter Google Calendar », autoriser puis créer vos événements.

Les événements sont créés sur le calendrier primaire par défaut. Le backend gère la persistance des tokens (table `CalendarCredential`) et rafraîchit automatiquement les accès.

## Tests, lint et formatage

```bash
# Frontend
cd client
pnpm lint        # ESLint (bloquant)
pnpm build       # Vérification TypeScript + build Vite

# Backend
cd ../server
pnpm lint
pnpm build       # Compilation TypeScript
```

Le formattage est géré par Prettier (inclus dans ESLint). Adaptez vos IDE/CI pour lancer `pnpm lint` avant commit.

## Sauvegardes et maintenance

- **Base de données :** sauvegarder le volume `database` ou effectuer des dumps réguliers (`pg_dump`).  
- **Uploads :** volume `uploads` à répliquer / synchroniser (photos, fichiers utilisateurs).  
- **Logs :** `docker compose logs -f backend`/`frontend` pour le suivi temps réel.  
- **Mises à jour :** reconstruire les images après chaque modification (`docker compose build`) et réappliquer `prisma migrate deploy` si le schéma évolue.  
- **Sécurité :** modifier `JWT_SECRET`, restreindre les ports à l’aide du pare-feu, et renouveler les certificats HTTPS via Certbot.

---

LifeOS est pensé pour vous donner une vision complète de vos routines, finances et objectifs. Ajustez les modules selon vos besoins, branchez votre domaine, et conservez la maîtrise totale de vos données en auto-hébergement. Bonne utilisation ! 🌱
