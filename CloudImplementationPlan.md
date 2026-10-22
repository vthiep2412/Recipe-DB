# Cloud Architecture and Persistence Implementation Plan

This document defines the production cloud architecture for RecipeDB. It outlines the hybrid infrastructure using Supabase and Cloudinary, designed to keep file sizes small, prevent compression artifacts, and stay within free-tier limits.

---

## 1. High-Level Architecture Overview

The system divides responsibilities between two specialized cloud services to eliminate single-provider bottlenecks:

1. **Supabase (Relational Database, User Identity, and State)**
   * User authentication and session management
   * User preferences and cooking profiles
   * Recipe metadata, section hierarchies, step trees, and F&Blang representations
   * Full-text search and future semantic vector similarity

2. **Cloudinary (Media Storage and Delivery)**
   * High-resolution food photography and step banners stored as JPEG XL masters
   * Dynamic on-the-fly image conversion to AVIF or WebP depending on client device support
   * Adaptive bitrate video streaming for recipe master videos and step micro-clips (AV1 and HLS)

---

## 2. Supabase Database Design and Egress Protection

Supabase provides 500 MB of storage and 50,000 monthly active users on the free tier. To prevent unnecessary egress consumption when listing or querying recipes, the data model strictly separates high-frequency catalog summaries from heavy recipe instruction trees.

### 2.1 Database Schema

#### `profiles` Table
Stores authenticated user preferences and state:
* `id`: UUID (Primary Key, references `auth.users.id`)
* `username`: Text (unique)
* `theme_preference`: Text (`light`, `dark`, or `system`)
* `timer_sound`: Text
* `created_at`: Timestamp with time zone
* `updated_at`: Timestamp with time zone

#### `recipes` Table
Stores primary catalog metadata:
* `id`: UUID (Primary Key)
* `owner_id`: UUID (Foreign Key references `profiles.id`)
* `title`: Text (indexed for search)
* `slug`: Text (unique)
* `description`: Text
* `image_url`: Text (Cloudinary secure delivery URL)
* `cuisine`: Text
* `course`: Text
* `difficulty`: Text
* `prep_time`: Text
* `cook_time`: Text
* `total_time`: Text
* `servings_base`: Integer
* `servings_unit`: Text
* `tags`: Array of Text
* `is_public`: Boolean (default true)
* `created_at`: Timestamp with time zone
* `updated_at`: Timestamp with time zone (indexed)

#### `recipe_details` Table
Stores heavy structural trees, fetched strictly on demand:
* `recipe_id`: UUID (Primary Key, Foreign Key references `recipes.id` on delete cascade)
* `sections_ast`: JSONB (full section, subsection, and step hierarchy)
* `ingredients_index`: JSONB (normalized list of ingredients with quantities)
* `cookware_index`: JSONB (distinct cookware names and specifiers)
* `raw_fablang`: Text (verbatim F&Blang script)
* `important_notes`: Text

### 2.2 Egress Prevention Protocol
1. **Strict Column Projection**:
   * Catalog browsing and search queries select only summary columns from `recipes`.
   * The heavy `recipe_details` record is requested only when a user navigates to a specific recipe route.
2. **Client-Side Cache and Stale-While-Revalidate**:
   * The client maintains a local cache of accessed recipes in IndexedDB.
   * Catalog requests query `id` and `updated_at` timestamps. If the local cache matches the server timestamp, data is read from disk with zero payload transfer.
3. **Debounced Search**:
   * Text filter queries in SearchPage debounce by 300 milliseconds to avoid issuing database queries on every keystroke.

---

## 3. Image Storage and Compression

Food photography requires preserving textures (such as pastry flakes, crusts, and sauce gloss) without incurring massive payload sizes.

### 3.1 Compression and Codecs
* **Master Storage**: All master images are uploaded and stored in Cloudinary as lossy JPEG XL (`.jxl`) at 90% quality. This keeps sharp edges, crust details, and fine textures while keeping storage consumption minimal.
* **On-The-Fly Client Delivery Conversion**:
  * Upon retrieval, Cloudinary converts the master `.jxl` dynamically based on the client device:
    * Serves **AVIF** to modern browsers (Chrome, Firefox, Edge, Android) for minimal delivery payload.
    * Falls back to **WebP** for older mobile and desktop browsers lacking AVIF support.
    * Serves native **JPEG XL** directly to clients supporting it (Apple Safari on iOS 17+ and macOS Sonoma).
  * Delivery quality is tuned to `q_80`, providing 80% to 90% visual retention while dropping delivery size by up to 85% compared to raw JPEG.

### 3.2 Dimensions and Profile Stripping
* **Hero Banners**: Capped at width 1200 with responsive limit (`w_1200,c_limit`).
* **Step Banners**: Capped at width 800 (`w_800,c_limit`).
* **Gallery and Thumbnails**: Scaled to width 320 with 16:10 aspect ratio (`w_320,c_fill,ar_16:10`).
* **Metadata Stripping**: Transformed using `fl_strip_profile` to remove camera EXIF tags, GPS coordinates, and color profiles, saving 10 KB to 25 KB per image.

### 3.3 Client-Side Pre-Flight Downscaling and Ingest Transcode
Before uploading, phone photos exceeding 4 MB are scaled down in an HTML5 canvas to a maximum bounding box of 2560 pixels and exported as a high-quality blob. The Cloudinary upload preset applies an incoming transformation (`f_jxl,q_90`) to immediately transcode and store the asset as a lossy JPEG XL master.

---

## 4. Adaptive Video Streaming and Audio Optimization

To support step micro-clips (5 to 30 seconds) and complete recipe walk-throughs without requiring users to download complete video files, video assets stream through HTTP Live Streaming (HLS).

### 4.1 Adaptive Bitrate Streaming (HLS Manifest)
* Master videos upload to Cloudinary once and generate an `.m3u8` adaptive manifest.
* The video stream splits into small 2-second segments (`.m4s`).
* Video streams dynamically scale resolution according to client network conditions:
  * **High Quality (Broadband / Fast WiFi)**: 1080p at 30 FPS (~1.2 Mbps AV1)
  * **Standard Quality (4G / Mobile)**: 720p at 30 FPS (~650 kbps AV1)
  * **Low Quality (Weak Signal / 3G)**: 540p or 480p at 30 FPS (~350 kbps AV1)

### 4.2 Timestamp Slicing for Step Micro-Clips
* Step cards define video micro-clips with `startSec` and `endSec`.
* Because media is segmented into 2-second chunks, the player downloads only the specific chunks matching that timestamp slice.
* A 6-second step technique clip fetches approximately 250 KB to 400 KB of data instead of buffering the entire recipe video.

### 4.3 Audio Compression
* **Channel Downmixing (`ac_1`)**: Converts audio from stereo to mono, cutting audio bandwidth by 50% with zero loss in kitchen intelligibility.
* **Target Codec**: Encodes via Opus (or HE-AAC fallback) at 40 kbps mono (`ac_aac,af_40k`).
* **Result**: Chef narration, sizzling, and boiling audio cues retain over 85% clarity while adding only 50 KB per 10 seconds of video.

---

## 5. Free-Tier Quota Budget and Protection Rules

| Metric | Provider Allowance | RecipeDB Target Budget | Safety Margin |
| :--- | :--- | :--- | :--- |
| **Database Space** | 500 MB (Supabase) | ~35 MB for 1,000 full recipes | >14x remaining capacity |
| **Active Users** | 50,000 MAU (Supabase) | Personal and shared household use | Capacity for up to 50,000 accounts |
| **Media Bandwidth** | 25 Credits / Month (Cloudinary) | ~20 GB monthly consumption | Safe within free allowance |
| **Step Photo Size** | 25 Credits Pool (~0.00005 credits/photo) | 30 KB to 60 KB (AVIF / WebP) | Loads in under 100 ms |
| **10s Video Clip** | 25 Credits Pool (~0.0006 credits/clip) | 400 KB to 800 KB (Segmented AV1) | Only buffers active seconds |

---

## 6. Implementation Phases

1. **Phase 1: Cloudinary Upload Pipeline**
   * Configure an unsigned Cloudinary upload preset restricted to target folders (`recipes/images/` and `recipes/videos/`), max file size caps (5 MB for photos, 35 MB for video clips), and an incoming transformation (`f_jxl,q_90`) to encode master images.
   * Implement client-side canvas pre-flight downscaling in MediaModal.
   * Store resulting public IDs and formatted URLs in StudioWorkspace.

2. **Phase 2: Database Layer and Client SDK**
   * Connect Supabase JavaScript client into Preact application.
   * Run initial migration creating `profiles`, `recipes`, and `recipe_details`.
   * Configure Row Level Security (RLS) policies allowing public recipe reads and authenticated owner writes.

3. **Phase 3: Catalog and Detail Query Separation**
   * Refactor SearchPage and Hub queries to request summary columns only.
   * Wire IndexedDB client caching layer with `updated_at` validation.
   * Connect RecipeDetailView to load `recipe_details` on demand.

4. **Phase 4: HLS Video Player Integration**
   * Integrate lightweight HLS streaming client into RecipeDetailView.
   * Wire step timestamp clips to seek directly to segment slices and loop between `startSec` and `endSec`.
