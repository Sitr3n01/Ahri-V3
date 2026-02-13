# Assets - Persona Images

## Structure

All persona assets are located in `public/assets/` and are referenced in `@ahri/shared/themes/index.ts`.

### Asset Types

1. **Avatar Images** - Circular profile pictures (used in chat bubbles)
   - Format: `{persona}_1.png`
   - Size: ~512x512px recommended
   - Usage: Chat messages, persona selector

2. **Desktop Backgrounds** - Full-screen backgrounds
   - Format: `background_{persona}.png`
   - Size: 1920x1080px recommended
   - Usage: App background (12% opacity in Chat Mode)

3. **Mobile Backgrounds** - Mobile-optimized backgrounds
   - Format: `background_{persona}_mobile.png`
   - Size: 1080x1920px (portrait) recommended
   - Usage: PWA mobile app

## Migration Status

✅ **Migrated from V2** (2024-02-12)
- Copied all 42 assets from `Ahri V2/Ahri/assets/`
- Created mobile fallbacks for 5 personas (frieren, herta, kafka, maomao, yae_miko)
- Created `default.png` as fallback avatar

## Persona List (17 total)

| Persona     | Avatar          | Desktop BG              | Mobile BG                      |
|-------------|-----------------|-------------------------|--------------------------------|
| ahri        | ahri_1.png      | background_ahri.png     | background_ahri_mobile.png     |
| cantarella  | cantarella_1.png| background_cantarella.png| background_cantarella_mobile.png|
| carlotta    | carlotta_1.png  | background_carlotta.png | background_carlotta_mobile.png |
| cartethyia  | cartethyia_1.png| background_cartethyia.png| background_cartethyia_mobile.png|
| cyrene      | cyrene_1.png    | background_cyrene.png   | background_cyrene_mobile.png   |
| frieren     | frieren_1.png   | background_frieren.png  | background_frieren_mobile.png* |
| furina      | furina_1.png    | background_furina.png   | background_furina_mobile.png*  |
| herta       | herta_1.png     | background_herta.png    | background_herta_mobile.png*   |
| kafka       | kafka_1.png     | background_kafka.png    | background_kafka_mobile.png*   |
| maomao      | maomao_1.png    | background_maomao.png   | background_maomao_mobile.png*  |
| march_7th   | march_7th_1.png | background_march_7th.png| background_march_7th_mobile.png|
| rakan       | rakan_1.png     | background_rakan.png    | background_rakan_mobile.png    |
| robin       | robin_1.png     | background_robin.png    | background_robin_mobile.png    |
| shorekeeper | shorekeeper_1.png| background_shorekeeper.png| background_shorekeeper_mobile.png*|
| sparkle     | sparkle_1.png   | background_sparkle.png  | background_sparkle_mobile.png  |
| yae_miko    | yae_miko_1.png  | background_yae_miko.png | background_yae_miko_mobile.png*|

*\*Fallback (copied from desktop background)*

## Adding New Personas

When creating a new persona via the UI (Fase 6 - Persona Editor), the system will:

1. **User uploads:**
   - Avatar PNG (recommended 512x512px)
   - Desktop background PNG (recommended 1920x1080px)
   - Mobile background PNG (optional, will use desktop as fallback)

2. **System generates:**
   - Copies files to `public/assets/` with naming convention
   - Updates `@ahri/shared/themes/index.ts` automatically (with user confirmation)
   - Creates `data/personas/{name}/persona.md` with YAML frontmatter

3. **File naming convention:**
   ```
   {persona_name}_1.png               → Avatar
   background_{persona_name}.png      → Desktop BG
   background_{persona_name}_mobile.png → Mobile BG (optional)
   ```

## Future Enhancements

- [ ] Image compression pipeline (reduce file sizes)
- [ ] WebP format support (better compression)
- [ ] Avatar cropping tool in Persona Editor
- [ ] Background blur/filter preview
- [ ] Batch import from folder
- [ ] Cloud storage sync (optional)

## Notes

- Assets are **not** in version control (too large)
- Keep original high-res files in a separate backup folder
- Desktop app uses Electron's `file://` protocol to load from `public/`
- Vite copies `public/` to `dist/` during build
- PWA caches images for offline use
