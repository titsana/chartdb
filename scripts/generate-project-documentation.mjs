import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
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
    if (file.includes('/lib/data/sql-import/'))
        return 'แปลงหรือ validate SQL เข้า Diagram';
    if (file.includes('/lib/data/sql-export/')) return 'สร้าง SQL จาก Diagram';
    if (file.includes('/lib/data/import-metadata/'))
        return 'แปลง metadata JSON เข้า Diagram';
    if (file.includes('/lib/dbml/')) return 'นำเข้า ส่งออก หรือ apply DBML';
    if (file.includes('/lib/data/')) return 'catalog และ data transformation';
    if (file.includes('/lib/')) return 'utility และ business logic';
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

const files = walk(sourceRoot);
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
md += `> สร้างจาก source ณ ${new Date().toISOString()}. เอกสารนี้ครอบคลุมไฟล์ TypeScript/TSX ทุกไฟล์และ named callable ที่ AST ตรวจพบ; anonymous inline callbacks อธิบายรวมกับ owner/flow เพราะไม่มี public identity.\n\n`;
md += `## สรุปเร็ว\n\n`;
md += `ChartDB คือ client-side React application สำหรับสร้าง ดู แก้ และแปลง database schema เป็น diagram. ข้อมูลหลักเก็บใน IndexedDB ผ่าน Dexie; ไม่ต้องส่ง credential ฐานข้อมูลให้ application. ระบบรับ schema ผ่าน metadata JSON, SQL หรือ DBML แล้ว normalize เป็น domain model เดียว ก่อน render ด้วย XYFlow และส่งออกเป็น SQL, DBML, JSON หรือรูปภาพ.\n\n`;
md += `- Source files: ${files.length}\n- Named functions/components/method contracts: ${functionCount}\n- Test files: ${testCount}\n- Runtime: React 18 + TypeScript + Vite\n- Local persistence: IndexedDB/Dexie\n- Diagram engine: @xyflow/react\n- Validation: Zod + dialect validators\n- UI: Tailwind + Radix UI wrappers\n\n`;
md += `## Startup และ route\n\n`;
md += `1. \`src/main.tsx\` โหลด polyfills/i18n/styles แล้ว mount \`App\`.\n2. \`src/app.tsx\` วาง Helmet, tooltip และ router providers.\n3. \`src/router.tsx\` lazy-load หน้า editor, examples, template listing/detail/clone และ not-found.\n4. Editor สร้าง provider tree สำหรับ storage, config, history, diff, canvas, keyboard, dialog และ ChartDB domain state.\n5. Diagram ID ใน URL เลือก diagram จาก IndexedDB; template routes โหลด static catalog แล้ว clone เข้า local storage.\n\n`;
md += `## Domain model\n\n`;
md += `\`Diagram\` เป็น aggregate root: metadata + \`tables\`, \`relationships\`, \`dependencies\`, \`areas\`, \`customTypes\`, \`notes\`. Table มี schema/name/position/fields/indexes/check constraints/view metadata. Relationship อ้าง table/field IDs พร้อม cardinality. Zod schemas validate serialized/imported data และ utility กลุ่ม \`apply-ids\` ป้องกัน ID collision ตอน import/clone.\n\n`;
md += `## State, persistence, history\n\n`;
md += `\`ChartDBProvider\` เป็น command layer ฝั่ง UI: ทุก add/update/delete เปลี่ยน React state, sync Dexie, emit event และบันทึก undo action เมื่อเปิด history. \`StorageProvider\` นิยาม IndexedDB schema/migrations และ CRUD. Read-only/template mode ใช้ no-op storage. History provider เก็บ undo/redo stacks; action replay เรียก ChartDB commands โดยปิดการสร้าง history ซ้ำ. Diff provider เปรียบเทียบ diagram snapshots แล้วเพิ่ม/เน้นสิ่งเปลี่ยน.\n\n`;
md += `## Import pipeline\n\n`;
md += `- Metadata: database-specific Smart Query คืน JSON -> filter/fix metadata -> import custom types/tables/fields/indexes/relationships/dependencies -> Diagram.\n- SQL: detect dialect/import method -> validator/autofix -> dialect importer parse statements -> common builders normalize domain objects. PostgreSQL dump path preprocesses dump-specific syntax.\n- DBML: preprocess unsupported array/check/table attributes -> @dbml/core parser -> validate types/checks -> map tables, fields, indexes, refs, enums -> Diagram.\n- Diagram JSON: Zod/compatibility utilities validate, migrate shape และ regenerate IDs เมื่อจำเป็น.\n\n`;
md += `## Export pipeline\n\n`;
md += `Diagram -> target selection -> native deterministic exporter เมื่อ dialect ตรงกัน. PostgreSQL ไป MySQL/SQL Server มี deterministic cross-dialect mapping. Generic conversion สร้าง schemas, custom types, tables, indexes, constraints และ foreign keys; unsupported features ถูกระบุ. DBML exporter serialize aggregate เป็น DBML. Image exporterจับ canvas แล้วใช้ html-to-image. AI path ใช้ configured OpenAI-compatible endpoint เฉพาะ flow ที่ deterministic conversion ไม่รองรับ.\n\n`;
md += `## UI composition\n\n`;
md += `Editor แบ่ง canvas กับ side panel. Canvas แปลง tables/relationships/areas/notes เป็น XYFlow nodes/edges, รองรับ drag, resize, selection, zoom, layout และ relationship creation. Side panel แก้ tables, fields, indexes, checks, custom types, DBML, areas และ notes. Dialogs ครอบคลุม create/open/import/export/schema. \`src/components\` เป็น Radix-based primitives ไม่มี business state หลัก.\n\n`;
md += `## Configuration และ deployment\n\n`;
md += `Vite อ่าน build-time env; \`public/config.js\` และ container entrypoint รองรับ runtime override สำหรับ API endpoint/model/analytics. Nginx template serve SPA. คำสั่งหลัก: \`npm run dev\`, \`npm test\`, \`npm run lint\`, \`npm run build\`.\n\n`;
md += `## ข้อควรรู้ก่อนแก้โค้ด\n\n`;
md += `- Domain object links ใช้ IDs; เปลี่ยน ID ต้อง remap relationship/index/dependency references ครบ.\n- Mutation ต้องรักษา React state, IndexedDB และ undo/redo ให้ตรงกัน.\n- Database capability ต่างกัน; เช็ก \`database-capabilities.ts\` ก่อนเพิ่ม import/export feature.\n- SQL identifier quoting, schema qualification, arrays, defaults และ composite keys มี regression tests จำนวนมาก.\n- Static templates/locales มีขนาดใหญ่แต่ไม่ใช่ runtime logic; reference ด้านล่างยังลงทะเบียนทุกไฟล์.\n\n`;
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
