import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const root = process.cwd();
// Two source roots — the React client (src/) and the NestJS realtime-
// collaboration server (server/src/), added when the server grew a real
// auth/REST/WS surface worth documenting rather than being invisible to
// this generator entirely.
const clientSourceRoot = path.join(root, 'src');
const serverSourceRoot = path.join(root, 'server', 'src');
const output = path.join(root, 'PROJECT_DOCUMENTATION.md');

const walk = (dir) =>
    fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((entry) =>
            entry.isDirectory()
                ? walk(path.join(dir, entry.name))
                : [path.join(dir, entry.name)]
        )
        .filter((file) => /\.tsx?$/.test(file))
        .sort();

const clean = (value) =>
    value.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
const relative = (file) => path.relative(root, file).split(path.sep).join('/');

const fileRole = (file) => {
    if (file.includes('/__tests__/') || /\.test\./.test(file))
        return 'ชุดทดสอบและกรณี regression';
    // server/src/* — NestJS realtime-collaboration backend (Hocuspocus +
    // Postgres). Checked before the client-only branches below so a path
    // segment name collision (e.g. neither exists today, but kept safe)
    // can't fall through to a client classification.
    if (file.startsWith('server/src/auth/'))
        return 'server: Azure AD (Entra ID) auth — guard, JWT verifier, AUTH_MODE state';
    if (file.startsWith('server/src/collab/'))
        return 'server: Hocuspocus wiring — WS upgrade, Postgres persistence extension, durable log';
    if (file.startsWith('server/src/db/'))
        return 'server: Postgres pool, schema/migration, plain-SQL CRUD';
    if (file.startsWith('server/src/diagrams/'))
        return 'server: /diagrams REST controller/module';
    if (file.startsWith('server/src/diagram-groups/'))
        return 'server: /diagram-groups REST controller/module (folder-style grouping)';
    if (file.startsWith('server/src/'))
        return 'server: bootstrap, config, health/config.js endpoints, or app module wiring';
    if (file.includes('/i18n/locales/')) return 'ข้อความแปลสำหรับ locale';
    if (file.includes('/templates-data/templates/'))
        return 'ข้อมูล schema ตัวอย่างสำเร็จรูป';
    if (file.includes('/components/')) return 'UI component ใช้ซ้ำ';
    if (file.includes('/context/'))
        return 'React context/provider และ shared state';
    if (file.includes('/hooks/')) return 'React hook สำหรับ logic ใช้ซ้ำ';
    if (file.includes('/dialogs/')) return 'dialog และ workflow ที่เกี่ยวข้อง';
    if (file.includes('/pages/')) return 'หน้า application และ UI เฉพาะหน้า';
    if (file.includes('/lib/domain/'))
        return 'domain model, schema, rule หรือ diff model';
    if (file.includes('/lib/auth/') || file === 'src/lib/msal-config.ts')
        return 'client: Azure AD (Entra ID) sign-in — MSAL config, token acquisition';
    if (file.includes('/lib/data/sql-import/'))
        return 'แปลงหรือ validate SQL เข้า Diagram';
    if (file.includes('/lib/data/sql-export/')) return 'สร้าง SQL จาก Diagram';
    if (file.includes('/lib/data/import-metadata/'))
        return 'แปลง metadata JSON เข้า Diagram';
    if (file.includes('/lib/dbml/')) return 'นำเข้า ส่งออก หรือ apply DBML';
    if (file.includes('/lib/collab/'))
        return 'client: Yjs room seeding/gating helpers สำหรับ non-editor creation flows';
    if (file.includes('/lib/data/')) return 'catalog และ data transformation';
    if (file.includes('/lib/')) return 'utility และ business logic';
    if (file === 'src/auth-gate.tsx')
        return 'client: gates the whole app behind Entra sign-in when AUTH_MODE=azure-ad';
    return 'bootstrap, configuration หรือ declaration';
};

const describe = (name, kind, file) => {
    if (/^use[A-Z]/.test(name))
        return `Hook อ่านหรือควบคุม ${clean(name.slice(3)) || 'state'}; ดู implementation สำหรับ dependency และ side effect`;
    if (/Provider$/.test(name))
        return 'Provider ประกอบ state/actions แล้วส่งผ่าน React context';
    if (/Context$/.test(name))
        return 'Context contract หรือ context object สำหรับ state/actions ร่วม';
    if (/^(get|find|select|resolve|lookup|detect|determine)/.test(name))
        return 'ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI';
    if (/^(is|has|can|should|supports|requires|validate|verify)/.test(name))
        return 'ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ';
    if (/^(create|generate|build|make)/.test(name))
        return 'สร้าง domain value, identifier, output หรือ UI structure ใหม่';
    if (/^(parse|import|convert|transform|map|normalize|preprocess)/.test(name))
        return 'แปลง input ให้อยู่ในรูปแบบที่ระบบใช้';
    if (/^(export|serialize|stringify|format|render)/.test(name))
        return 'สร้าง representation สำหรับแสดงผลหรือส่งออก';
    if (
        /^(add|insert|append|update|set|remove|delete|clear|reset|apply|toggle|move|resize|clone)/.test(
            name
        )
    )
        return 'เปลี่ยน state หรือ domain data ตามชื่อ function';
    if (/^(handle|on)[A-Z_]/.test(name))
        return 'Event handler เชื่อม user/system event กับ state action';
    if (kind === 'component' || (/^[A-Z]/.test(name) && file.endsWith('.tsx')))
        return 'React component แสดง UI และประสาน props/context/event';
    if (kind === 'method')
        return 'Method ของ class/object contract; พฤติกรรมตามชื่อและ signature';
    return 'Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature';
};

const signatureFor = (node, sf, name) => {
    let text = node.getText(sf);
    const body = node.body;
    if (body) text = text.slice(0, body.pos - node.pos).trim();
    text = clean(text).replace(/\s*=>\s*$/, ' =>');
    if (text.length > 220) text = `${text.slice(0, 217)}...`;
    return text || name;
};

const wrappedCallable = (node) => {
    if (!node) return undefined;
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return node;
    if (ts.isCallExpression(node)) {
        for (const argument of node.arguments) {
            const callable = wrappedCallable(argument);
            if (callable) return callable;
        }
    }
    if (
        ts.isParenthesizedExpression(node) ||
        ts.isAsExpression(node) ||
        ts.isSatisfiesExpression(node) ||
        ts.isNonNullExpression(node)
    ) {
        return wrappedCallable(node.expression);
    }
    return undefined;
};

const inspect = (file) => {
    const source = fs.readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const symbols = [];
    const exports = new Set();

    const add = (name, kind, node, signatureNode = node) => {
        if (!name) return;
        const line =
            sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        symbols.push({
            name,
            kind,
            line,
            signature: signatureFor(signatureNode, sf, name),
        });
    };

    const visit = (node) => {
        if (ts.isFunctionDeclaration(node) && node.name) {
            add(node.name.text, 'function', node);
        } else if (
            ts.isVariableDeclaration(node) &&
            ts.isIdentifier(node.name) &&
            wrappedCallable(node.initializer)
        ) {
            const jsx = file.endsWith('.tsx') && /^[A-Z]/.test(node.name.text);
            add(
                node.name.text,
                jsx ? 'component' : 'function',
                node,
                wrappedCallable(node.initializer)
            );
        } else if (
            (ts.isMethodDeclaration(node) ||
                ts.isGetAccessor(node) ||
                ts.isSetAccessor(node) ||
                ts.isMethodSignature(node)) &&
            node.name
        ) {
            add(clean(node.name.getText(sf)), 'method', node);
        } else if (
            ts.isPropertySignature(node) &&
            node.name &&
            node.type &&
            ts.isFunctionTypeNode(node.type)
        ) {
            add(clean(node.name.getText(sf)), 'method', node, node.type);
        }
        if (
            (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !==
            0
        ) {
            if (node.name) exports.add(clean(node.name.getText(sf)));
            if (ts.isVariableStatement(node)) {
                node.declarationList.declarations.forEach((d) =>
                    exports.add(clean(d.name.getText(sf)))
                );
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return { source, symbols, exports: [...exports].sort() };
};

const clientFiles = walk(clientSourceRoot);
const serverFiles = walk(serverSourceRoot);
const files = [...clientFiles, ...serverFiles];
const records = files.map((file) => ({ file, ...inspect(file) }));
const functionCount = records.reduce(
    (sum, item) => sum + item.symbols.length,
    0
);
const testCount = records.filter(
    (item) => item.file.includes('/__tests__/') || /\.test\./.test(item.file)
).length;

const sections = new Map();
for (const record of records) {
    const rel = relative(record.file);
    const key = rel.split('/').slice(0, 3).join('/');
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key).push(record);
}

let md = `# เอกสารโครงการ ChartDB\n\n`;
md += `> สร้างจาก source ณ ${new Date().toISOString()}. เอกสารนี้ครอบคลุมไฟล์ TypeScript/TSX ทุกไฟล์ (client \`src/\` และ server \`server/src/\`) และ named callable ที่ AST ตรวจพบ; anonymous inline callbacks อธิบายรวมกับ owner/flow เพราะไม่มี public identity.\n\n`;
md += `## สรุปเร็ว\n\n`;
md += `ChartDB เป็น full-stack application สำหรับสร้าง ดู แก้ และแปลง database schema เป็น diagram แบบ real-time multiplayer. Client (\`src/\`) เป็น React app; ระบบรับ schema ผ่าน metadata JSON, SQL หรือ DBML แล้ว normalize เป็น domain model เดียว ก่อน render ด้วย XYFlow และส่งออกเป็น SQL, DBML, JSON หรือรูปภาพ — ส่วนนี้ไม่เปลี่ยนจากเดิม. สิ่งที่เปลี่ยนคือ persistence: **IndexedDB/Dexie ถูกถอดออกทั้งหมดแล้ว** — diagram metadata, folder-style grouping และเนื้อหาจริง (tables/relationships/areas/notes/ฯลฯ) เก็บที่ NestJS collab server (\`server/\`) ผ่าน Postgres แทน แก้ไขซิงค์กันแบบ real-time ด้วย Yjs (CRDT) + Hocuspocus ทุกคนที่เปิด diagram เดียวกันเห็นการแก้ของกันและกันทันที พร้อม cursor/selection/avatar presence และ follow-mode แบบ Figma. Auth เป็น opt-in: ค่าเริ่มต้นยังเปิดกว้าง (ใครมี diagram id ก็แก้ได้ — ตั้งใจสำหรับ tool แบบ anonymous) แต่ตั้ง \`AUTH_MODE=azure-ad\` เปิด Microsoft Entra ID sign-in ได้จริงทั้งฝั่ง REST/WebSocket/UI. localStorage ยังใช้อยู่แต่เหลือแค่ preference ต่อ browser (theme, presence display name, ฯลฯ) ไม่ใช่ diagram data แล้ว.\n\n`;
md += `- Source files: ${files.length} (client ${clientFiles.length}, server ${serverFiles.length})\n- Named functions/components/method contracts: ${functionCount}\n- Test files: ${testCount}\n- Client runtime: React 18 + TypeScript + Vite\n- Server runtime: NestJS + Hocuspocus (Yjs WebSocket) + Postgres (pg, plain SQL — ไม่มี ORM)\n- Diagram content persistence: server-side Postgres ผ่าน Yjs update log + periodic snapshot compaction (ไม่มี IndexedDB/Dexie แล้ว)\n- Per-browser preferences only: localStorage (theme, presence display name/color, dialog last-open, ฯลฯ)\n- Realtime sync: Yjs CRDT ผ่าน @hocuspocus/provider (client) / @hocuspocus/server (server)\n- Auth: ไม่บังคับโดย default; Azure AD (Entra ID) เปิดได้ผ่าน \`AUTH_MODE=azure-ad\`\n- Diagram engine: @xyflow/react\n- Validation: Zod + dialect validators\n- UI: Tailwind + Radix UI wrappers\n\n`;
md += `## Startup และ route (client)\n\n`;
md += `1. \`src/main.tsx\` โหลด polyfills/i18n/styles แล้ว mount \`App\`.\n2. \`src/app.tsx\` วาง Helmet, tooltip, \`AuthGate\` แล้วค่อย router providers — \`AuthGate\` (\`src/auth-gate.tsx\`) เป็น no-op ทั้งหมดเมื่อ \`AUTH_MODE\` เป็น \`public\` (ค่า default), แต่ wall ทั้งแอปไว้หลัง Entra sign-in (รวม \`/examples\`/\`/templates\`) เมื่อเป็น \`azure-ad\`.\n3. \`src/router.tsx\` lazy-load หน้า editor, examples, template listing/detail/clone และ not-found.\n4. Editor สร้าง provider tree สำหรับ storage, config, local-config, history, diff, canvas, keyboard, dialog และ ChartDB domain state.\n5. Diagram ID ใน URL → \`loadDiagram\` เรียก REST (\`GET /diagrams/:id\`) หา metadata แล้วเปิด Yjs room ผ่าน Hocuspocus provider เพื่อดึงเนื้อหาจริง; template routes โหลด static catalog แล้ว seed เข้า room ใหม่ (\`seedDiagramRoom\`) แทนการ clone เข้า local storage แบบเดิม.\n\n`;
md += `## Domain model\n\n`;
md += `\`Diagram\` เป็น aggregate root: metadata (รวม \`groupId?: string | null\` สำหรับ folder-style grouping — ดู \`DiagramGroup\`) + \`tables\`, \`relationships\`, \`dependencies\`, \`areas\`, \`customTypes\`, \`notes\`. Table มี schema/name/position/fields/indexes/check constraints/view metadata. Relationship อ้าง table/field IDs พร้อม cardinality — \`foreignKeyFieldId\`/\`computeForeignKeyFieldIds\` (\`db-relationship.ts\`) เป็น single source of truth ว่า FK อยู่ field ไหน (many-to-one → source field, ที่เหลือ → target field). Zod schemas validate serialized/imported data — \`note.order\` ยอมรับ \`null\` แล้ว normalize เป็น \`undefined\` (ไฟล์เก่าบางไฟล์มี \`null\` แทนที่จะไม่มี key เลย) — และ utility กลุ่ม \`apply-ids\` ป้องกัน ID collision ตอน import/clone.\n\n`;
md += `## State, persistence, history (client)\n\n`;
md += `\`ChartDBProvider\` เป็น command layer ฝั่ง UI: ทุก add/update/delete เขียนลง shared \`Y.Doc\` (Yjs) ภายใต้ \`localOrigin\` symbol ต่อ provider instance — undo/redo ใช้ \`Y.UndoManager\` scoped ด้วย \`trackedOrigins\` ตาม origin นั้น (คนละ browser tab undo ของใครของมัน ไม่ไปลบการแก้ไขของอีกฝั่ง). \`StorageProvider\` (REST-backed, ไม่ใช่ IndexedDB แล้ว) คุย \`GET/POST/PATCH/DELETE /diagrams\` และ \`/diagram-groups\` กับ collab server สำหรับ metadata/listing/grouping เท่านั้น — เนื้อหาจริงของ diagram (tables/relationships/ฯลฯ) ไม่เคยผ่าน REST เลย อยู่ใน Yjs room อย่างเดียว, เปิดได้ผ่าน \`loadDiagramFromData\`/\`reconcileWithRoom\`. \`local-config-provider.tsx\` เก็บ preference ต่อ browser (theme, presence display name — ใช้ชื่อจาก Entra account อัตโนมัติเมื่อ sign in อยู่, ไม่งั้น random "Guest NNNN") ผ่าน localStorage. Read-only/template mode ใช้ no-op storage. History provider เก็บ undo/redo stacks; action replay เรียก ChartDB commands โดยปิดการสร้าง history ซ้ำ. Diff provider เปรียบเทียบ diagram snapshots แล้วเพิ่ม/เน้นสิ่งเปลี่ยน. Presence/awareness (\`usePresence\`, \`presence-avatar-bar\`) แสดง cursor/selection/avatar ของคนอื่นที่เปิด diagram เดียวกัน พร้อม "follow" แบบ Figma (\`resolve-follow-viewport.ts\`, กัน cyclic follow ผ่าน \`wouldCreateFollowCycle\`).\n\n`;
md += `## Import pipeline\n\n`;
md += `- Metadata: database-specific Smart Query คืน JSON -> filter/fix metadata -> import custom types/tables/fields/indexes/relationships/dependencies -> Diagram.\n- SQL: detect dialect/import method -> validator/autofix -> dialect importer parse statements -> common builders normalize domain objects. PostgreSQL dump path preprocesses dump-specific syntax.\n- DBML: preprocess unsupported array/check/table attributes -> @dbml/core parser -> validate types/checks -> map tables, fields, indexes, refs, enums -> Diagram.\n- Diagram JSON: Zod/compatibility utilities validate, migrate shape และ regenerate IDs เมื่อจำเป็น — ดู \`note.order\`'s null-normalization ด้านบนสำหรับตัวอย่าง compatibility issue จริงที่เจอ.\n\n`;
md += `## Export pipeline\n\n`;
md += `Diagram -> target selection -> native deterministic exporter เมื่อ dialect ตรงกัน. PostgreSQL ไป MySQL/SQL Server มี deterministic cross-dialect mapping. Generic conversion สร้าง schemas, custom types, tables, indexes, constraints และ foreign keys; unsupported features ถูกระบุ. DBML exporter serialize aggregate เป็น DBML. Image exporterจับ canvas แล้วใช้ html-to-image. AI path ใช้ configured OpenAI-compatible endpoint เฉพาะ flow ที่ deterministic conversion ไม่รองรับ.\n\n`;
md += `## UI composition\n\n`;
md += `Editor แบ่ง canvas กับ side panel. Canvas แปลง tables/relationships/areas/notes เป็น XYFlow nodes/edges, รองรับ drag, resize, selection, zoom, layout และ relationship creation; ต่ำกว่า zoom threshold หนึ่ง (LOD) table node จะ render แบบย่อ (เก็บ Handle ไว้ให้ edge ยังต่อได้ แต่ตัด text/icon ออก) เพื่อ performance ตอน diagram ใหญ่มาก. Top navbar มี presence avatar bar (follow คนอื่นได้). Side panel แก้ tables, fields, indexes, checks, custom types, DBML, areas และ notes. Dialogs ครอบคลุม create/open/import/export/schema — open-diagram dialog รองรับ folder-style grouping (สร้าง/rename/ลบ group, ย้าย diagram เข้า/ออก group, collapse/expand group header). \`src/components\` เป็น Radix-based primitives ไม่มี business state หลัก.\n\n`;
md += `## Realtime collaboration server (server/src/)\n\n`;
md += `NestJS app แยกจาก client repo คนละ package (\`server/package.json\`) แต่ไล่มาด้วยกัน — build ด้วย \`npm run build\` (tsc, module: CommonJS), dev ด้วย \`npm run dev\` (\`tsx watch\`; ระวัง: esbuild ไม่ emit decorator metadata ให้ implicit type-based DI ครบทุกกรณี ต้องใช้ \`@Inject(Token)\` explicit สำหรับ param ที่เจอปัญหา — เจอมาแล้ว 2 จุด: \`WsUpgradeService\`'s \`HttpAdapterHost\`, \`EntraAuthGuard\`'s \`Reflector\`).\n\n`;
md += `- **\`collab/\`**: \`WsUpgradeService\` ผูก WebSocket upgrade เข้ากับ Nest's HTTP server เอง (raw \`httpServer.on('upgrade', ...)\` — ไม่ผ่าน Nest routing/guard pipeline เลย, เหมือน \`ServeStaticModule\`'s static serving) แล้วส่งต่อให้ \`@hocuspocus/server\`. \`persistence-extension.ts\` เป็น Hocuspocus \`Extension\` เขียนเอง (ไม่ใช้ \`@hocuspocus/extension-database\`) เพื่อคุม compaction เอง: ทุก sync-update message → \`appendUpdate\` (INSERT \`yjs_updates\`) synchronous ก่อน Hocuspocus apply/broadcast (กัน update หายถ้า server crash), Hocuspocus's \`onStoreDocument\` (debounce 2s, ceiling 10s เสมอแม้แก้รัวๆ ต่อเนื่อง) → \`storeSnapshotAndPrune\` เก็บ full-state ลง \`yjs_snapshots\` แล้ว \`DELETE\` แถวที่ compact ไปแล้วออกจาก \`yjs_updates\`.\n- **\`db/\`**: \`pg\` pool ตรง ๆ, ไม่มี ORM. Schema หลัก: \`collab_diagrams\`, \`collab_diagram_groups\`, \`yjs_updates\`, \`yjs_snapshots\` — ตั้งชื่อ prefix \`collab_\`/\`yjs_\` เจตนา (ไม่ใช้ \`diagrams\`/\`diagram_groups\` เฉย ๆ) เพราะ Postgres instance เดียวกันมีตารางเก่าตกค้างจาก branch \`feature/collaboration_v2\` (TypeORM, ยกเลิกไปแล้ว) ที่ใช้ชื่อนั้นอยู่ก่อน — \`CREATE TABLE IF NOT EXISTS\` เงียบ ๆ ไม่สร้างทับถ้าชื่อชนกัน.\n- **\`diagrams/\`, \`diagram-groups/\`**: REST controllers ธรรมดา คุยกับ \`db/\` โดยตรง ไม่ผ่าน Hocuspocus.\n- **\`auth/\`**: Azure AD (Entra ID) — opt-in ผ่าน \`AUTH_MODE=azure-ad\` env var (explicit, ไม่ใช่ implicit-by-credential-presence). \`EntraAuthGuard\` (NestJS \`APP_GUARD\`) คุม REST, ยกเว้น \`@Public()\` routes (\`/health\`, \`/config.js\`). Hocuspocus's \`onAuthenticate\` hook คุม WebSocket แยกต่างหาก (จำเป็น — REST guard ไม่ครอบ WS upgrade path เลย). Token verify ผ่าน \`jsonwebtoken\`/\`jwks-rsa\` (ไม่ใช่ \`jose\` — เช็คแล้วว่า \`jose\`@6 เป็น ESM-only จะพังใต้ CommonJS \`dist/\` build), จำกัด \`aud\` ให้ตรง API audience เท่านั้น (ไม่รับ bare client id กัน ID token สวมรอย) + เช็ค \`scp\` มี \`access_as_user\`.\n- **\`config-js.controller.ts\`**: \`GET /config.js\` แบบ dynamic (ไม่ใช่ static file) reproduce runtime env-override ของ nginx image เดิม สำหรับ deploy แบบ single-container (\`Dockerfile.combined\`) ที่ไม่มี nginx แล้ว — ตั้ง \`Cache-Control: no-store\` เจตนา (เจอปัญหาจริง: Cloudflare cache endpoint นี้ไว้เพราะนามสกุล \`.js\`, ทำให้ config ใหม่ไม่มีผลจนกว่าจะ purge cache).\n\n`;
md += `## Configuration และ deployment\n\n`;
md += `**Client**: Vite อ่าน build-time \`VITE_*\` env; \`window.env\`/\`/config.js\` (nginx template เดิม หรือ NestJS's \`ConfigJsController\` ใน single-container setup) รองรับ runtime override สำหรับ OpenAI settings, analytics, \`AUTH_MODE\`, \`ENTRA_TENANT_ID\`/\`ENTRA_CLIENT_ID\`/\`ENTRA_API_SCOPE\`, \`COLLAB_WS_URL\`. ไม่ตั้ง \`COLLAB_WS_URL\` เลย → production build derive เป็น same-origin \`wss://<host เดียวกับหน้าเว็บ>\` อัตโนมัติ (\`wsUrlForOrigin\`), dev mode ยัง default \`ws://localhost:1234\` เหมือนเดิม.\n\n**Deploy มี 2 แบบ**: (1) \`Dockerfile\` เดิม — nginx serve client เท่านั้น, server แยก process/container ต่างหาก (cross-origin, ต้องตั้ง \`WEBSOCKET_ORIGIN_ALLOWLIST\`/CORS เอง) — นี่คือ image ที่ CI (\`.github/workflows/publish.yaml\`) ยัง build/push อยู่ ไม่ถูกแตะ. (2) \`Dockerfile.combined\` (ใหม่) — NestJS serve client's built \`dist/\` เอง (\`ServeStaticModule\`, ทำ 3-stage build) client+API domain เดียวกัน ไม่ต้องมี nginx; ถ้าตั้ง \`WEBSOCKET_ORIGIN_ALLOWLIST\` ต้องใส่ domain ตัวเองด้วย ไม่งั้น REST ทำงานปกติแต่ WebSocket จะเงียบ ๆ 403 (คนละ error path กับ REST). \`docker-compose.yml\` (repo root) รวม app (Dockerfile.combined) + Postgres สำหรับ deploy คนเดียว — ตัวแปร config ทั้งหมดผ่าน \`.env\` (ดู comment หัวไฟล์).\n\nServer ต้องมี \`DATABASE_URL\` เสมอ (ไม่มี in-memory mode) — schema migrate อัตโนมัติตอน server start. คำสั่งหลัก client: \`npm run dev\`, \`npm test\`, \`npm run lint\`, \`npm run build\`. Server (ใน \`server/\`): \`npm run dev\` (tsx watch), \`npm test\` (vitest, \`pretest\` รัน \`npm run build\` เองก่อนเพราะ integration test spawn compiled \`dist/main.js\` จริง — decorator metadata ไม่รอด esbuild transform ของ vitest).\n\n`;
md += `## ข้อควรรู้ก่อนแก้โค้ด\n\n`;
md += `- Domain object links ใช้ IDs; เปลี่ยน ID ต้อง remap relationship/index/dependency references ครบ.\n- Diagram content mutation ทั้งหมดต้องผ่าน shared \`Y.Doc\` (ไม่ใช่ React state ตรง ๆ) ถึงจะ sync ข้าม client และคง undo/redo ให้ตรงกัน — เขียน state ตรง ๆ จะโดน Yjs observer projection ทับเงียบ ๆ.\n- Database capability ต่างกัน; เช็ก \`database-capabilities.ts\` ก่อนเพิ่ม import/export feature.\n- SQL identifier quoting, schema qualification, arrays, defaults และ composite keys มี regression tests จำนวนมาก.\n- Static templates/locales มีขนาดใหญ่แต่ไม่ใช่ runtime logic; reference ด้านล่างยังลงทะเบียนทุกไฟล์.\n- **Server-side**: อย่าใช้ implicit type-based NestJS DI กับ param ที่ dev mode (\`tsx\`) พังบ่อย — ใช้ \`@Inject(Token)\` explicit เสมอถ้าไม่ชัวร์. ตารางชื่อ \`diagrams\`/\`diagram_groups\`/\`users\` เฉย ๆ ใน Postgres instance นี้เป็นของเก่าตกค้าง คนละ schema/ไม่เกี่ยวกับโค้ดนี้ — อย่าไปใช้.\n- Guard ระดับ Nest (\`APP_GUARD\`) ไม่ครอบ raw HTTP upgrade handler หรือ \`ServeStaticModule\`'s middleware — endpoint ใหม่ที่ต้องบังคับ auth ต้องเช็คว่าจริง ๆ ผ่าน Nest controller pipeline หรือเปล่าก่อนเชื่อว่า guard ป้องกันให้.\n\n`;
md += `## Function และ file reference\n\n`;
md += `Signature ตัด body และย่อเมื่อยาวเกิน 220 ตัวอักษร. เลขบรรทัดอ้าง source ณ เวลาสร้างเอกสาร.\n\n`;

for (const [section, items] of sections) {
    md += `### \`${section}\`\n\n`;
    for (const item of items) {
        const rel = relative(item.file);
        md += `#### \`${rel}\`\n\n`;
        md += `บทบาท: ${fileRole(rel)}. `;
        md += item.exports.length
            ? `Exports: ${item.exports.map((x) => `\`${x}\``).join(', ')}.\n\n`
            : 'ไม่มี named export.\n\n';
        if (!item.symbols.length) {
            md += `ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.\n\n`;
            continue;
        }
        md += `| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |\n|---:|---|---|---|---|\n`;
        for (const symbol of item.symbols) {
            md += `| ${symbol.line} | \`${symbol.name}\` | ${symbol.kind} | ${describe(symbol.name, symbol.kind, rel)} | \`${symbol.signature.replace(/`/g, '\\`')}\` |\n`;
        }
        md += '\n';
    }
}

md += `## ขอบเขตและการ regenerate\n\n`;
md += `เอกสาร function reference เน้น named callables ซึ่งค้นหาและอ้างอิงได้. JSX callbacks, array callbacks, test callbacks และ event lambdas แบบ anonymous อยู่ใต้ function/component เจ้าของ ไม่แยกชื่อ. Regenerate หลัง source เปลี่ยนด้วย:\n\n\`\`\`bash\nnode scripts/generate-project-documentation.mjs\n\`\`\`\n`;

fs.writeFileSync(output, md);
console.log(
    `Wrote ${path.relative(root, output)}: ${files.length} files, ${functionCount} symbols, ${md.length} chars`
);
