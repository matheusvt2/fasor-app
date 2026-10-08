---
type: Project Overview
title: Releng (codename fasor) overview
description: Product purpose, users, stack and the four-layer shape. Open first for orientation.
tags: [project, stack]
timestamp: 2026-09-30T00:00:00Z
sources: [AGENTS.md, _bmad-output/specs/spec-fasor/SPEC.md]
---
# Overview

Releng captures medium-voltage substation (cabine primária) test sheets on site, on a tablet, offline, and generates Fasor Engenharia's FO.SERV-03 relatório as DOCX and PDF. The user-visible name is the placeholder `PRODUTO`; `fasor` is the internal codename and never appears in user-visible text.

Success test: a relatório composed from the seeded Template, filled with the Porto Seguro job data, generated as a DOCX the client recognizes as their own FO.SERV-03.

## Stack

pnpm 12 monorepo, Node 24, TypeScript 6. `packages/domain` pure zod kernel; `apps/web` React 19, Vite 8, Dexie (IndexedDB); `apps/api` Hono 4, Drizzle, PostgreSQL 18, pg-boss; `services/ocr` Python FastAPI sidecar (profile `ocr`, off by default); MinIO locally, S3 on AWS. Everything runs in docker-compose.

## Shape

Local-first client with an operation outbox, a thin sync API, a modular-monolith server, all over one shared pure kernel. Details: [layers](/architecture/layers.md), [ops and local-first](/architecture/ops-and-local-first.md).

## Capabilities

SPEC.md lists CAP-1 to CAP-26: registries and identity (1-7), templates (8), setup/Sumário/tree/blocks (9-11), the equipment sheet (12-18), camera assists (19), photos (20), points of attention (21), offline sync (22), multi-device merge (23), generation (24), parecer and pre-issue list (25), the optional AI emission audit (26, Story 13.8). Grep `CAP-n` in SPEC.md for one. Build order: [delivery-slice](/project/delivery-slice.md).
