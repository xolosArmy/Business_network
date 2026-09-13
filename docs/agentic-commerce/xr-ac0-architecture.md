# XR-AC0 — Agentic Commerce Architecture: Xolos Ramírez

**Specification Document:** `XR-AC0-REVISION-B-FREEZE-20260913`  
**Commit Freeze Reference:** `90206e5eb53837a853a1147da359dff07d6999d5`  
**Network:** xolosArmy Network / Tonalli Ecosystem  
**Target Application:** Xolos Ramírez (`https://xolosramirez.com`)  
**Status:** Pre-release verification (`testing` / `in-review`)

---

## 1. Executive Summary

This architecture specification defines the read-only agentic commerce integration and capability baseline for Xolos Ramírez (ID: `xolosramirez`), adhering strictly to the **Gate C2 Canonical Roadmap Operating Instruction v1.1**.

The architecture establishes:
1. **WebMCP Read-Only Capability Surface (WM-XR1):** Imperative registration via `document.modelContext.registerTool` offering 5 public query tools.
2. **Deterministic Data Adapter:** Static in-memory catalog guaranteeing zero direct DOM coupling, zero personally identifiable information (PII), zero private pricing exposure, and deterministic serialization.
3. **Verified Dossier Protocol (X402-XR0):** Offline test harness and RFC/Draft specification for cryptographic 402 Payment Required challenge/response cycles, strictly decoupled from live broadcast, wallet signing, or production settlement.

---

## 2. Capability Matrix

| Capability | Status | Invariants | Security / Audit Reference |
|---|---|---|---|
| **WebMCP Tools** (`webMcpStatus`) | `testing` | Read-only (`annotations: { readOnlyHint: true }`), zero DOM mutation, zero side effects. | `WM-XR1` |
| **x402 Protocol** (`x402Status`) | `planned` | Offline harness only. No live broadcast, zero key escape, zero mainnet assets. | `X402-XR0-OFFLINE-HARNESS` |
| **Settlement Assets** | `[]` (None in production) | Upstream TBD. No mainnet tokens declared or active. | Frozen |
| **Funding Paths** | `["direct_inquiry", "planned_x402_verified_dossier"]` | Planned only. Offline verification fixtures. | Gate C2 Roadmap v1.1 |

---

## 3. WebMCP Registered Tools

The 5 normative tools exposed on the browser context:
1. `list_available_xolos`: Returns published catalog of available and reserved puppies.
2. `get_xolo_profile`: Returns detailed public profile for a specific puppy ID.
3. `get_delivery_information`: Returns official shipping procedures and zone policies.
4. `get_contact_options`: Returns verified communication channels (WhatsApp, Email, Video Call).
5. `get_price_process_information`: Explains adoption pricing procedure without disclosing private commercial negotiations.

---

## 4. Verification & Audit Trail

- **Git Commit SHA:** `90206e5eb53837a853a1147da359dff07d6999d5` (frozen base commit)
- **Schema Compliance:** Draft 2020-12 fail-closed validation.
- **Evidence Requirement:** No capability can be advertised as `"production"` without verified security status and published specification.
