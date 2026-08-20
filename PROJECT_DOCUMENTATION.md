# เอกสารโครงการ ChartDB

> สร้างจาก source ณ 2026-08-20T03:11:45.620Z. เอกสารนี้ครอบคลุมไฟล์ TypeScript/TSX ทุกไฟล์และ named callable ที่ AST ตรวจพบ; anonymous inline callbacks อธิบายรวมกับ owner/flow เพราะไม่มี public identity.

## สรุปเร็ว

ChartDB คือ client-side React application สำหรับสร้าง ดู แก้ และแปลง database schema เป็น diagram. ข้อมูลหลักเก็บใน IndexedDB ผ่าน Dexie; ไม่ต้องส่ง credential ฐานข้อมูลให้ application. ระบบรับ schema ผ่าน metadata JSON, SQL หรือ DBML แล้ว normalize เป็น domain model เดียว ก่อน render ด้วย XYFlow และส่งออกเป็น SQL, DBML, JSON หรือรูปภาพ.

- Source files: 553
- Named functions/components/method contracts: 2888
- Test files: 107
- Runtime: React 18 + TypeScript + Vite
- Local persistence: IndexedDB/Dexie
- Diagram engine: @xyflow/react
- Validation: Zod + dialect validators
- UI: Tailwind + Radix UI wrappers

## Startup และ route

1. `src/main.tsx` โหลด polyfills/i18n/styles แล้ว mount `App`.
2. `src/app.tsx` วาง Helmet, tooltip และ router providers.
3. `src/router.tsx` lazy-load หน้า editor, examples, template listing/detail/clone และ not-found.
4. Editor สร้าง provider tree สำหรับ storage, config, history, diff, canvas, keyboard, dialog และ ChartDB domain state.
5. Diagram ID ใน URL เลือก diagram จาก IndexedDB; template routes โหลด static catalog แล้ว clone เข้า local storage.

## Domain model

`Diagram` เป็น aggregate root: metadata + `tables`, `relationships`, `dependencies`, `areas`, `customTypes`, `notes`. Table มี schema/name/position/fields/indexes/check constraints/view metadata. Relationship อ้าง table/field IDs พร้อม cardinality. Zod schemas validate serialized/imported data และ utility กลุ่ม `apply-ids` ป้องกัน ID collision ตอน import/clone.

## State, persistence, history

`ChartDBProvider` เป็น command layer ฝั่ง UI: ทุก add/update/delete เปลี่ยน React state, sync Dexie, emit event และบันทึก undo action เมื่อเปิด history. `StorageProvider` นิยาม IndexedDB schema/migrations และ CRUD. Read-only/template mode ใช้ no-op storage. History provider เก็บ undo/redo stacks; action replay เรียก ChartDB commands โดยปิดการสร้าง history ซ้ำ. Diff provider เปรียบเทียบ diagram snapshots แล้วเพิ่ม/เน้นสิ่งเปลี่ยน.

## Import pipeline

- Metadata: database-specific Smart Query คืน JSON -> filter/fix metadata -> import custom types/tables/fields/indexes/relationships/dependencies -> Diagram.
- SQL: detect dialect/import method -> validator/autofix -> dialect importer parse statements -> common builders normalize domain objects. PostgreSQL dump path preprocesses dump-specific syntax.
- DBML: preprocess unsupported array/check/table attributes -> @dbml/core parser -> validate types/checks -> map tables, fields, indexes, refs, enums -> Diagram.
- Diagram JSON: Zod/compatibility utilities validate, migrate shape และ regenerate IDs เมื่อจำเป็น.

## Export pipeline

Diagram -> target selection -> native deterministic exporter เมื่อ dialect ตรงกัน. PostgreSQL ไป MySQL/SQL Server มี deterministic cross-dialect mapping. Generic conversion สร้าง schemas, custom types, tables, indexes, constraints และ foreign keys; unsupported features ถูกระบุ. DBML exporter serialize aggregate เป็น DBML. Image exporterจับ canvas แล้วใช้ html-to-image. AI path ใช้ configured OpenAI-compatible endpoint เฉพาะ flow ที่ deterministic conversion ไม่รองรับ.

## UI composition

Editor แบ่ง canvas กับ side panel. Canvas แปลง tables/relationships/areas/notes เป็น XYFlow nodes/edges, รองรับ drag, resize, selection, zoom, layout และ relationship creation. Side panel แก้ tables, fields, indexes, checks, custom types, DBML, areas และ notes. Dialogs ครอบคลุม create/open/import/export/schema. `src/components` เป็น Radix-based primitives ไม่มี business state หลัก.

## Configuration และ deployment

Vite อ่าน build-time env; `public/config.js` และ container entrypoint รองรับ runtime override สำหรับ API endpoint/model/analytics. Nginx template serve SPA. คำสั่งหลัก: `npm run dev`, `npm test`, `npm run lint`, `npm run build`.

## ข้อควรรู้ก่อนแก้โค้ด

- Domain object links ใช้ IDs; เปลี่ยน ID ต้อง remap relationship/index/dependency references ครบ.
- Mutation ต้องรักษา React state, IndexedDB และ undo/redo ให้ตรงกัน.
- Database capability ต่างกัน; เช็ก `database-capabilities.ts` ก่อนเพิ่ม import/export feature.
- SQL identifier quoting, schema qualification, arrays, defaults และ composite keys มี regression tests จำนวนมาก.
- Static templates/locales มีขนาดใหญ่แต่ไม่ใช่ runtime logic; reference ด้านล่างยังลงทะเบียนทุกไฟล์.

## Function และ file reference

Signature ตัด body และย่อเมื่อยาวเกิน 220 ตัวอักษร. เลขบรรทัดอ้าง source ณ เวลาสร้างเอกสาร.

### `src/app.tsx`

#### `src/app.tsx`

บทบาท: bootstrap, configuration หรือ declaration. Exports: `App`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 8 | `App` | component | React component แสดง UI และประสาน props/context/event | `() =>` |

### `src/components/accordion`

#### `src/components/accordion/accordion.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 9 | `AccordionItem` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 21 | `AccordionTrigger` | component | React component แสดง UI และประสาน props/context/event | `({ className, children, iconPosition = 'left', ...props }, ref) =>` |
| 27 | `renderIcon` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() =>` |
| 59 | `AccordionContent` | component | React component แสดง UI และประสาน props/context/event | `({ className, children, ...props }, ref) =>` |

### `src/components/alert-dialog`

#### `src/components/alert-dialog/alert-dialog.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 13 | `AlertDialogOverlay` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 28 | `AlertDialogContent` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 46 | `AlertDialogHeader` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) =>` |
| 60 | `AlertDialogFooter` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) =>` |
| 74 | `AlertDialogTitle` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 86 | `AlertDialogDescription` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 99 | `AlertDialogAction` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 111 | `AlertDialogCancel` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |

### `src/components/alert`

#### `src/components/alert/alert.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 22 | `Alert` | component | React component แสดง UI และประสาน props/context/event | `({ className, variant, ...props }, ref) =>` |
| 35 | `AlertTitle` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 50 | `AlertDescription` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |

### `src/components/avatar`

#### `src/components/avatar/avatar.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 6 | `Avatar` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 21 | `AvatarImage` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 33 | `AvatarFallback` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |

### `src/components/badge`

#### `src/components/badge/badge-variants.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `badgeVariants`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/components/badge/badge.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `BadgeProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 12 | `Badge` | function | React component แสดง UI และประสาน props/context/event | `function Badge({ className, variant, ...props }: BadgeProps) {` |

### `src/components/breadcrumb`

#### `src/components/breadcrumb/breadcrumb.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 7 | `Breadcrumb` | component | React component แสดง UI และประสาน props/context/event | `({ ...props }, ref) =>` |
| 15 | `BreadcrumbList` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 30 | `BreadcrumbItem` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 42 | `BreadcrumbLink` | component | React component แสดง UI และประสาน props/context/event | `({ asChild, className, ...props }, ref) =>` |
| 60 | `BreadcrumbPage` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 75 | `BreadcrumbSeparator` | component | React component แสดง UI และประสาน props/context/event | `({ children, className, ...props }: React.ComponentProps<'li'>) =>` |
| 91 | `BreadcrumbEllipsis` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }: React.ComponentProps<'span'>) =>` |

### `src/components/button`

#### `src/components/button/button-variants.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `buttonVariants`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/components/button/button-with-alternatives.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `ButtonAlternative`, `ButtonWithAlternativesProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 22 | `onClick` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |
| 39 | `ButtonWithAlternatives` | component | React component แสดง UI และประสาน props/context/event | `( { className, variant, size, asChild = false, alternatives, children, onClick, dropdownTriggerClassName, chevronDownIconClassName, ...props }, ref ) => {` |

#### `src/components/button/button.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `ButtonProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 15 | `Button` | component | React component แสดง UI และประสาน props/context/event | `({ className, variant, size, asChild = false, ...props }, ref) => {` |

### `src/components/card`

#### `src/components/card/card.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `Card` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 19 | `CardHeader` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 31 | `CardTitle` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 43 | `CardDescription` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 55 | `CardContent` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 63 | `CardFooter` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |

### `src/components/checkbox`

#### `src/components/checkbox/checkbox.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 7 | `Checkbox` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |

### `src/components/code-snippet`

#### `src/components/code-snippet/code-editor.ts`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/components/code-snippet/code-snippet.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `CodeSnippet`, `CodeSnippetAction`, `CodeSnippetProps`, `DiffEditor`, `Editor`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 16 | `Editor` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 22 | `DiffEditor` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 33 | `onClick` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |
| 51 | `CodeSnippet` | component | React component แสดง UI และประสาน props/context/event | `({ className, code, codeToCopy, loading, language = 'sql', autoScroll = false, isComplete = true, editorProps, actions, actionsTooltipSide, allowCopy = true, }) => {` |
| 97 | `copyToClipboard` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async () =>` |

#### `src/components/code-snippet/config.ts`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 11 | `getWorker` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `getWorker(_, label) {` |

#### `src/components/code-snippet/dbml/dbml-completion-provider.ts`

บทบาท: UI component ใช้ซ้ำ. Exports: `DBMLCompletionManager`, `registerDBMLCompletionProvider`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 13 | `dispose` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 15 | `updateSource` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(content: string) => void` |
| 34 | `registerDBMLCompletionProvider` | function | Provider ประกอบ state/actions แล้วส่งผ่าน React context | `export function registerDBMLCompletionProvider( monaco: Monaco, initialContent: string = '' ): DBMLCompletionManager { const compiler = new Compiler(); // Initialize with content if provided if (initialContent) { comp...` |

#### `src/components/code-snippet/dbml/utils.ts`

บทบาท: UI component ใช้ซ้ำ. Exports: `clearErrorHighlight`, `highlightErrorLine`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `highlightErrorLine` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ error, model, editorDecorationsCollection, }: { error: DBMLError; model?: monaco.editor.ITextModel \| null; editorDecorationsCollection: \| monaco.editor.IEditorDecorationsCollection \| undefined; }) =>` |
| 43 | `clearErrorHighlight` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `( editorDecorationsCollection: \| monaco.editor.IEditorDecorationsCollection \| undefined ) =>` |

#### `src/components/code-snippet/languages/dbml-language.ts`

บทบาท: UI component ใช้ซ้ำ. Exports: `setupDBMLLanguage`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `setupDBMLLanguage` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(monaco: Monaco) =>` |
| 40 | `dataTypesNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dt) =>` |

#### `src/components/code-snippet/themes/dark.ts`

บทบาท: UI component ใช้ซ้ำ. Exports: `DarkTheme`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/components/code-snippet/themes/light.ts`

บทบาท: UI component ใช้ซ้ำ. Exports: `LightTheme`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

### `src/components/color-picker`

#### `src/components/color-picker/color-picker.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `ColorPicker`, `ColorPickerProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 12 | `onChange` | method | Event handler เชื่อม user/system event กับ state action | `(color: string) => void` |
| 14 | `popoverOnMouseDown` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(e: React.MouseEvent) => void` |
| 15 | `popoverOnClick` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(e: React.MouseEvent) => void` |
| 18 | `ColorPicker` | component | React component แสดง UI และประสาน props/context/event | `({ color, onChange, disabled, popoverOnMouseDown, popoverOnClick }, ref) =>` |

### `src/components/combobox`

#### `src/components/combobox/combobox.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `Combobox`, `ComboboxOptions`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 34 | `onChange` | method | Event handler เชื่อม user/system event กับ state action | `(event: string \| string[]) => void` |
| 35 | `onCreate` | method | Event handler เชื่อม user/system event กับ state action | `(value: string) => void` |
| 41 | `Combobox` | component | React component แสดง UI และประสาน props/context/event | `( { options, selected, className, placeholder, mode = 'single', emptyText, onChange, onCreate, popoverClassName, buttonClassName, }, ref ) => {` |

### `src/components/command`

#### `src/components/command/command.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 9 | `Command` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 26 | `CommandDialog` | component | React component แสดง UI และประสาน props/context/event | `({ children, ...props }: CommandDialogProps) =>` |
| 38 | `CommandInput` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 57 | `CommandList` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 73 | `CommandEmpty` | component | React component แสดง UI และประสาน props/context/event | `(props, ref) =>` |
| 86 | `CommandGroup` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 102 | `CommandSeparator` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 114 | `CommandItem` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 130 | `CommandShortcut` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) =>` |

#### `src/components/command/dialog.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 15 | `DialogOverlay` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 30 | `DialogContent` | component | React component แสดง UI และประสาน props/context/event | `({ className, children, ...props }, ref) =>` |
| 54 | `DialogHeader` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) =>` |
| 68 | `DialogFooter` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) =>` |
| 82 | `DialogTitle` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 97 | `DialogDescription` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |

### `src/components/context-menu`

#### `src/components/context-menu/context-menu.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 23 | `ContextMenuSubTrigger` | component | React component แสดง UI และประสาน props/context/event | `({ className, inset, children, ...props }, ref) =>` |
| 44 | `ContextMenuSubContent` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 59 | `ContextMenuContent` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 76 | `ContextMenuItem` | component | React component แสดง UI และประสาน props/context/event | `({ className, inset, ...props }, ref) =>` |
| 94 | `ContextMenuCheckboxItem` | component | React component แสดง UI และประสาน props/context/event | `({ className, children, checked, ...props }, ref) =>` |
| 118 | `ContextMenuRadioItem` | component | React component แสดง UI และประสาน props/context/event | `({ className, children, ...props }, ref) =>` |
| 140 | `ContextMenuLabel` | component | React component แสดง UI และประสาน props/context/event | `({ className, inset, ...props }, ref) =>` |
| 158 | `ContextMenuSeparator` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 170 | `ContextMenuShortcut` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) =>` |

### `src/components/diagram-icon`

#### `src/components/diagram-icon/diagram-icon.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `DiagramIcon`, `DiagramIconProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 21 | `DiagramIcon` | component | React component แสดง UI และประสาน props/context/event | `({ databaseType, databaseEdition, className, imgClassName, onClick }, ref) =>` |

### `src/components/dialog`

#### `src/components/dialog/dialog.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 17 | `DialogOverlay` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 32 | `DialogContent` | component | React component แสดง UI และประสาน props/context/event | `( { className, children, showClose, showBack, onBackClick, backButtonClassName, blurBackground, forceOverlay, ...props }, ref ) => (` |
| 40 | `onBackClick` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |
| 107 | `DialogHeader` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) =>` |
| 121 | `DialogFooter` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) =>` |
| 135 | `DialogTitle` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 150 | `DialogDescription` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 162 | `DialogInternalContent` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |

### `src/components/drawer`

#### `src/components/drawer/drawer.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 6 | `Drawer` | component | React component แสดง UI และประสาน props/context/event | `({ shouldScaleBackground = true, ...props }: React.ComponentProps<typeof DrawerPrimitive.Root>) =>` |
| 23 | `DrawerOverlay` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 35 | `DrawerContent` | component | React component แสดง UI และประสาน props/context/event | `({ className, children, fullScreen, ...props }, ref) =>` |
| 58 | `DrawerHeader` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) =>` |
| 69 | `DrawerFooter` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) =>` |
| 80 | `DrawerTitle` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 95 | `DrawerDescription` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |

### `src/components/dropdown-menu`

#### `src/components/dropdown-menu/dropdown-menu.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 23 | `DropdownMenuSubTrigger` | component | React component แสดง UI และประสาน props/context/event | `({ className, inset, children, ...props }, ref) =>` |
| 45 | `DropdownMenuSubContent` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 61 | `DropdownMenuContent` | component | React component แสดง UI และประสาน props/context/event | `({ className, sideOffset = 4, ...props }, ref) =>` |
| 80 | `DropdownMenuItem` | component | React component แสดง UI และประสาน props/context/event | `({ className, inset, ...props }, ref) =>` |
| 98 | `DropdownMenuCheckboxItem` | component | React component แสดง UI และประสาน props/context/event | `({ className, children, checked, ...props }, ref) =>` |
| 122 | `DropdownMenuRadioItem` | component | React component แสดง UI และประสาน props/context/event | `({ className, children, ...props }, ref) =>` |
| 144 | `DropdownMenuLabel` | component | React component แสดง UI และประสาน props/context/event | `({ className, inset, ...props }, ref) =>` |
| 162 | `DropdownMenuSeparator` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 174 | `DropdownMenuShortcut` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) =>` |

### `src/components/empty-state`

#### `src/components/empty-state/empty-state.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `EmptyState`, `EmptyStateActionButton`, `EmptyStateFooterAction`, `EmptyStateProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 18 | `onClick` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |
| 26 | `onClick` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |
| 42 | `EmptyState` | component | React component แสดง UI และประสาน props/context/event | `( { title, description, className, titleClassName, descriptionClassName, imageClassName, primaryAction, secondaryAction, footerAction, }, ref ) => {` |
| 63 | `hasActions` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() => !!(primaryAc` |
| 67 | `hasFooterAction` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 69 | `emptyStateImage` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

### `src/components/empty`

#### `src/components/empty/empty.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 6 | `Empty` | function | React component แสดง UI และประสาน props/context/event | `function Empty({ className, ...props }: React.ComponentProps<'div'>) {` |
| 19 | `EmptyHeader` | function | React component แสดง UI และประสาน props/context/event | `function EmptyHeader({ className, ...props }: React.ComponentProps<'div'>) {` |
| 47 | `EmptyMedia` | function | React component แสดง UI และประสาน props/context/event | `function EmptyMedia({ className, variant = 'default', ...props }: React.ComponentProps<'div'> & VariantProps<typeof emptyMediaVariants>) {` |
| 62 | `EmptyTitle` | function | React component แสดง UI และประสาน props/context/event | `function EmptyTitle({ className, ...props }: React.ComponentProps<'div'>) {` |
| 72 | `EmptyDescription` | function | React component แสดง UI และประสาน props/context/event | `function EmptyDescription({ className, ...props }: React.ComponentProps<'p'>) {` |
| 85 | `EmptyContent` | function | React component แสดง UI และประสาน props/context/event | `function EmptyContent({ className, ...props }: React.ComponentProps<'div'>) {` |

### `src/components/file-uploader`

#### `src/components/file-uploader/file-uploader.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `FileUploader`, `FileUploaderProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 10 | `onFilesChange` | method | Event handler เชื่อม user/system event กับ state action | `(files: File[]) => void` |
| 15 | `FileUploader` | component | React component แสดง UI และประสาน props/context/event | `({ onFilesChange, multiple, supportedExtensions, }) =>` |
| 24 | `isFileSupported` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(file: File) => {` |
| 35 | `handleFiles` | function | Event handler เชื่อม user/system event กับ state action | `(selectedFiles: FileList) => {` |
| 37 | `newFiles` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(file) =>` |
| 65 | `onDragOver` | function | Event handler เชื่อม user/system event กับ state action | `(e: React.DragEvent<HTMLDivElement>) =>` |
| 70 | `onDragLeave` | function | Event handler เชื่อม user/system event กับ state action | `(e: React.DragEvent<HTMLDivElement>) =>` |
| 75 | `onDrop` | function | Event handler เชื่อม user/system event กับ state action | `(e: React.DragEvent<HTMLDivElement>) => {` |
| 92 | `removeFile` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(fileToRemove: File) =>` |

### `src/components/hover-card`

#### `src/components/hover-card/hover-card.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 10 | `HoverCardContent` | component | React component แสดง UI และประสาน props/context/event | `({ className, align = 'center', sideOffset = 4, ...props }, ref) =>` |

### `src/components/input`

#### `src/components/input/input.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 5 | `Input` | component | React component แสดง UI และประสาน props/context/event | `({ className, type, ...props }, ref) => {` |

### `src/components/label`

#### `src/components/label/label-variants.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `labelVariants`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/components/label/label.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 8 | `Label` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |

### `src/components/link`

#### `src/components/link/link.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `Link`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `Link` | component | React component แสดง UI และประสาน props/context/event | `({ className, children, ...props }, ref) =>` |

### `src/components/list-menu`

#### `src/components/list-menu/list-menu.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `ListMenu`, `ListMenuItem`, `ListMenuProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 16 | `ListMenu` | component | React component แสดง UI และประสาน props/context/event | `({ className, items }, ref) => {` |

### `src/components/menubar`

#### `src/components/menubar/menubar.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 21 | `Menubar` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 36 | `MenubarTrigger` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 51 | `MenubarSubTrigger` | component | React component แสดง UI และประสาน props/context/event | `({ className, inset, children, ...props }, ref) =>` |
| 72 | `MenubarSubContent` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 87 | `MenubarContent` | component | React component แสดง UI และประสาน props/context/event | `( { className, align = 'start', alignOffset = -4, sideOffset = 8, ...props }, ref ) => (` |
| 118 | `MenubarItem` | component | React component แสดง UI และประสาน props/context/event | `({ className, inset, ...props }, ref) =>` |
| 136 | `MenubarCheckboxItem` | component | React component แสดง UI และประสาน props/context/event | `({ className, children, checked, ...props }, ref) =>` |
| 159 | `MenubarRadioItem` | component | React component แสดง UI และประสาน props/context/event | `({ className, children, ...props }, ref) =>` |
| 181 | `MenubarLabel` | component | React component แสดง UI และประสาน props/context/event | `({ className, inset, ...props }, ref) =>` |
| 199 | `MenubarSeparator` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 211 | `MenubarShortcut` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) =>` |

### `src/components/pagination`

#### `src/components/pagination/pagination.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 11 | `Pagination` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }: React.ComponentProps<'nav'>) =>` |
| 21 | `PaginationContent` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 33 | `PaginationItem` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 46 | `PaginationLink` | component | React component แสดง UI และประสาน props/context/event | `({ className, isActive, size = 'icon', ...props }: PaginationLinkProps) =>` |
| 66 | `PaginationPrevious` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }: React.ComponentProps<typeof PaginationLink>) =>` |
| 82 | `PaginationNext` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }: React.ComponentProps<typeof PaginationLink>) =>` |
| 98 | `PaginationEllipsis` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }: React.ComponentProps<'span'>) =>` |

### `src/components/popover`

#### `src/components/popover/popover.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 12 | `PopoverContent` | component | React component แสดง UI และประสาน props/context/event | `({ className, align = 'center', sideOffset = 4, ...props }, ref) =>` |

### `src/components/resizable`

#### `src/components/resizable/resizable.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 7 | `ResizablePanelGroup` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) =>` |
| 22 | `ResizableHandle` | component | React component แสดง UI และประสาน props/context/event | `({ withHandle, className, ...props }: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & { withHandle?: boolean; }) =>` |

### `src/components/scroll-area`

#### `src/components/scroll-area/scroll-area.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 6 | `ScrollArea` | component | React component แสดง UI และประสาน props/context/event | `({ className, children, ...props }, ref) =>` |
| 24 | `ScrollBar` | component | React component แสดง UI และประสาน props/context/event | `({ className, orientation = 'vertical', ...props }, ref) =>` |

### `src/components/select-box`

#### `src/components/select-box/select-box.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `SelectBox`, `SelectBoxOption`, `SelectBoxProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 37 | `optionSuffix` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(option: SelectBoxOption) => string` |
| 38 | `onChange` | method | Event handler เชื่อม user/system event กับ state action | `( values: string[] \| string, regexMatches?: string[] \| string ) => void` |
| 55 | `onOpenChange` | method | Event handler เชื่อม user/system event กับ state action | `(open: boolean) => void` |
| 59 | `commandOnMouseDown` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(e: React.MouseEvent) => void` |
| 60 | `commandOnClick` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(e: React.MouseEvent) => void` |
| 61 | `onSearchChange` | method | Event handler เชื่อม user/system event กับ state action | `(search: string) => void` |
| 65 | `SelectBox` | component | React component แสดง UI และประสาน props/context/event | `( { inputPlaceholder, emptyPlaceholder, placeholder, className, options, value, valueSuffix, onChange, multiple, oneLine, selectAll, optionSuffix, deselectAll, clearText, showClear, keepOrder, disabled, open, onOpenCh...` |
| 105 | `onOpenChange` | function | Event handler เชื่อม user/system event กับ state action | `(isOpen: boolean) => {` |
| 119 | `handleSelect` | function | Event handler เชื่อม user/system event กับ state action | `(selectedValue: string, regexMatches?: string[]) => {` |
| 135 | `handleClear` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 141 | `handleSelectAll` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 143 | `allIds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(option) =>` |
| 147 | `selectedMultipleOptions` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `() =>` |
| 184 | `isAllSelected` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 192 | `handleKeyDown` | function | Event handler เชื่อม user/system event กับ state action | `(e: React.KeyboardEvent) => {` |
| 202 | `groups` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 224 | `hasGroups` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 231 | `renderOption` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `(option: SelectBoxOption) => {` |

### `src/components/select`

#### `src/components/select/select.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 18 | `SelectTrigger` | component | React component แสดง UI และประสาน props/context/event | `({ className, children, ...props }, ref) =>` |
| 38 | `SelectScrollUpButton` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 55 | `SelectScrollDownButton` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 73 | `SelectContent` | component | React component แสดง UI และประสาน props/context/event | `({ className, children, position = 'popper', ...props }, ref) =>` |
| 105 | `SelectLabel` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 117 | `SelectItem` | component | React component แสดง UI และประสาน props/context/event | `({ className, children, ...props }, ref) =>` |
| 139 | `SelectSeparator` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |

### `src/components/separator`

#### `src/components/separator/separator.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 6 | `Separator` | component | React component แสดง UI และประสาน props/context/event | `( { className, orientation = 'horizontal', decorative = true, ...props }, ref ) => (` |

### `src/components/sheet`

#### `src/components/sheet/sheet.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 15 | `SheetOverlay` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 52 | `SheetContent` | component | React component แสดง UI และประสาน props/context/event | `({ side = 'right', className, children, ...props }, ref) =>` |
| 73 | `SheetHeader` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) =>` |
| 87 | `SheetFooter` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) =>` |
| 101 | `SheetTitle` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 113 | `SheetDescription` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |

### `src/components/sidebar`

#### `src/components/sidebar/sidebar.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 38 | `setOpen` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(open: boolean) => void` |
| 40 | `setOpenMobile` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(open: boolean) => void` |
| 42 | `toggleSidebar` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `() => void` |
| 47 | `SidebarProvider` | component | Provider ประกอบ state/actions แล้วส่งผ่าน React context | `( { defaultOpen = true, open: openProp, onOpenChange: setOpenProp, className, style, children, ...props }, ref ) => {` |
| 52 | `onOpenChange` | method | Event handler เชื่อม user/system event กับ state action | `(open: boolean) => void` |
| 74 | `setOpen` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(value: boolean \| ((value: boolean) => boolean)) => {` |
| 91 | `toggleSidebar` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |
| 99 | `handleKeyDown` | function | Event handler เชื่อม user/system event กับ state action | `(event: KeyboardEvent) =>` |
| 117 | `contextValue` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => ({` |
| 167 | `Sidebar` | component | React component แสดง UI และประสาน props/context/event | `( { side = 'left', variant = 'sidebar', collapsible = 'offcanvas', className, children, ...props }, ref ) => {` |
| 282 | `SidebarTrigger` | component | React component แสดง UI และประสาน props/context/event | `({ className, onClick, ...props }, ref) =>` |
| 308 | `SidebarRail` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 337 | `SidebarInset` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 355 | `SidebarInput` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 373 | `SidebarHeader` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 388 | `SidebarFooter` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 403 | `SidebarSeparator` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 418 | `SidebarContent` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 436 | `SidebarGroup` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 454 | `SidebarGroupLabel` | component | React component แสดง UI และประสาน props/context/event | `({ className, asChild = false, ...props }, ref) =>` |
| 476 | `SidebarGroupAction` | component | React component แสดง UI และประสาน props/context/event | `({ className, asChild = false, ...props }, ref) =>` |
| 499 | `SidebarGroupContent` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 512 | `SidebarMenu` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 525 | `SidebarMenuItem` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 561 | `SidebarMenuButton` | component | React component แสดง UI และประสาน props/context/event | `( { asChild = false, isActive = false, variant = 'default', size = 'default', tooltip, className, ...props }, ref ) => {` |
| 623 | `SidebarMenuAction` | component | React component แสดง UI และประสาน props/context/event | `({ className, asChild = false, showOnHover = false, ...props }, ref) =>` |
| 654 | `SidebarMenuBadge` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 675 | `SidebarMenuSkeleton` | component | React component แสดง UI และประสาน props/context/event | `({ className, showIcon = false, ...props }, ref) =>` |
| 682 | `width` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 716 | `SidebarMenuSub` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 733 | `SidebarMenuSubItem` | component | React component แสดง UI และประสาน props/context/event | `({ ...props }, ref) =>` |
| 739 | `SidebarMenuSubButton` | component | React component แสดง UI และประสาน props/context/event | `({ asChild = false, size = 'md', isActive, className, ...props }, ref) =>` |

#### `src/components/sidebar/use-sidebar.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `useSidebar`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `useSidebar` | function | Hook อ่านหรือควบคุม Sidebar; ดู implementation สำหรับ dependency และ side effect | `() =>` |

### `src/components/skeleton`

#### `src/components/skeleton/skeleton.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `Skeleton` | function | React component แสดง UI และประสาน props/context/event | `function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {` |

### `src/components/spinner`

#### `src/components/spinner/spinner.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `Spinner`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 40 | `Spinner` | function | React component แสดง UI และประสาน props/context/event | `export function Spinner({ size, show, children, className, }: SpinnerContentProps) {` |

### `src/components/table`

#### `src/components/table/table.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 5 | `Table` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 19 | `TableHeader` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 27 | `TableBody` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 39 | `TableFooter` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 54 | `TableRow` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 69 | `TableHead` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 84 | `TableCell` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 99 | `TableCaption` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |

### `src/components/tabs`

#### `src/components/tabs/tabs.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 8 | `TabsList` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 23 | `TabsTrigger` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 38 | `TabsContent` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |

### `src/components/textarea`

#### `src/components/textarea/textarea.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `TextareaProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 7 | `Textarea` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) => {` |

### `src/components/toast`

#### `src/components/toast/toast.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 10 | `ToastViewport` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 41 | `Toast` | component | React component แสดง UI และประสาน props/context/event | `({ className, variant, ...props }, ref) =>` |
| 56 | `ToastAction` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 71 | `ToastClose` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 89 | `ToastTitle` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |
| 101 | `ToastDescription` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |

#### `src/components/toast/toaster.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `Toaster`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 12 | `Toaster` | function | React component แสดง UI และประสาน props/context/event | `export function Toaster() {` |

#### `src/components/toast/use-toast.ts`

บทบาท: UI component ใช้ซ้ำ. Exports: `reducer`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 28 | `genId` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function genId() {` |
| 59 | `addToRemoveQueue` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(toastId: string) =>` |
| 64 | `timeout` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 75 | `reducer` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(state: State, action: Action): State =>` |
| 134 | `dispatch` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function dispatch(action: Action) {` |
| 143 | `toast` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function toast({ ...props }: Toast) {` |
| 146 | `update` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(props: ToasterToast) =>` |
| 151 | `dismiss` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 172 | `useToast` | function | Hook อ่านหรือควบคุม Toast; ดู implementation สำหรับ dependency และ side effect | `function useToast() {` |

### `src/components/toggle`

#### `src/components/toggle/toggle-group.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 15 | `ToggleGroup` | component | React component แสดง UI และประสาน props/context/event | `({ className, variant, size, children, ...props }, ref) =>` |
| 33 | `ToggleGroupItem` | component | React component แสดง UI และประสาน props/context/event | `({ className, children, variant, size, ...props }, ref) =>` |

#### `src/components/toggle/toggle-variants.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/components/toggle/toggle.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 8 | `Toggle` | component | React component แสดง UI และประสาน props/context/event | `({ className, variant, size, ...props }, ref) =>` |

### `src/components/tooltip`

#### `src/components/tooltip/tooltip.tsx`

บทบาท: UI component ใช้ซ้ำ. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 12 | `TooltipContent` | component | React component แสดง UI และประสาน props/context/event | `({ className, sideOffset = 4, ...props }, ref) =>` |

### `src/components/tree-view`

#### `src/components/tree-view/tree-item-skeleton.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `TreeItemSkeleton`, `TreeItemSkeletonProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 7 | `TreeItemSkeleton` | component | React component แสดง UI และประสาน props/context/event | `({ className, style, }) =>` |

#### `src/components/tree-view/tree-view.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `TreeView`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 33 | `onNodeClick` | method | Event handler เชื่อม user/system event กับ state action | `(node: TreeNode<Type, Context>) => void` |
| 42 | `renderHoverComponent` | method | สร้าง representation สำหรับแสดงผลหรือส่งออก | `(node: TreeNode<Type, Context>) => ReactNode` |
| 43 | `renderActionsComponent` | method | สร้าง representation สำหรับแสดงผลหรือส่งออก | `(node: TreeNode<Type, Context>) => ReactNode` |
| 48 | `TreeView` | function | React component แสดง UI และประสาน props/context/event | `export function TreeView< Type extends string, Context extends Record<Type, unknown>, >({ data, fetchChildren, onNodeClick, className, defaultIcon = File, defaultFolderIcon = Folder, defaultIconProps, defaultFolderIco...` |
| 79 | `selectedId` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `() =>` |
| 83 | `setSelectedId` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(value: SetStateAction<string \| undefined>) => {` |
| 120 | `handleNodeSelect` | function | Event handler เชื่อม user/system event กับ state action | `(node: TreeNode<Type, Context>) =>` |
| 168 | `onToggle` | method | Event handler เชื่อม user/system event กับ state action | `( nodeId: string, nodeType: Type, nodeContext: Context[Type], staticChildren?: TreeNode<Type, Context>[] ) => void` |
| 174 | `onNodeClick` | method | Event handler เชื่อม user/system event กับ state action | `(node: TreeNode<Type, Context>) => void` |
| 181 | `onSelect` | method | Event handler เชื่อม user/system event กับ state action | `(node: TreeNode<Type, Context>) => void` |
| 183 | `renderHoverComponent` | method | สร้าง representation สำหรับแสดงผลหรือส่งออก | `(node: TreeNode<Type, Context>) => ReactNode` |
| 184 | `renderActionsComponent` | method | สร้าง representation สำหรับแสดงผลหรือส่งออก | `(node: TreeNode<Type, Context>) => ReactNode` |
| 189 | `TreeNode` | function | React component แสดง UI และประสาน props/context/event | `function TreeNode<Type extends string, Context extends Record<Type, unknown>>({ node, level, expanded, loading, loadedChildren, hasMoreChildren, onToggle, onNodeClick, defaultIcon: DefaultIcon, defaultFolderIcon: Defa...` |
| 467 | `findNodeById` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `function findNodeById< Type extends string, Context extends Record<Type, unknown>, >( nodes: TreeNode<Type, Context>[], id: string, initialPath: TreeNode<Type, Context>[] = [] ): { node: TreeNode<Type, Context> \| nul...` |

#### `src/components/tree-view/tree.ts`

บทบาท: UI component ใช้ซ้ำ. Exports: `FetchChildrenFunction`, `SelectableTreeProps`, `TreeNode`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 39 | `onSelectedChange` | method | Event handler เชื่อม user/system event กับ state action | `(node: TreeNode<Type, Context>) => void` |

#### `src/components/tree-view/use-tree.ts`

บทบาท: UI component ใช้ซ้ำ. Exports: `ExpandedState`, `useTree`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 24 | `useTree` | function | Hook อ่านหรือควบคุม Tree; ดู implementation สำหรับ dependency และ side effect | `export function useTree< Type extends string, Context extends Record<Type, unknown>, >({ fetchChildren, expanded: expandedProp, setExpanded: setExpandedProp, disableCache = false, }: { fetchChildren?: FetchChildrenFun...` |
| 40 | `expanded` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => expanded` |
| 44 | `setExpanded` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(value: SetStateAction<ExpandedState>) => {` |
| 62 | `mergeChildren` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( staticChildren: TreeNode<Type, Context>[] = [], fetchedChildren: TreeNode<Type, Context>[] = [] ) => {` |
| 70 | `uniqueStaticChildren` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(child) => !fetchedChildren` |
| 78 | `toggleNode` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( nodeId: string, nodeType: Type, nodeContext: Context[Type], staticChildren?: TreeNode<Type, Context>[] ) => {` |

### `src/components/zoomable-image`

#### `src/components/zoomable-image/zoomable-image.tsx`

บทบาท: UI component ใช้ซ้ำ. Exports: `ZoomableImage`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 10 | `ZoomableImage` | component | React component แสดง UI และประสาน props/context/event | `(props, ref) =>` |

### `src/context/alert-context`

#### `src/context/alert-context/alert-context.tsx`

บทบาท: React context/provider และ shared state. Exports: `AlertContext`, `alertContext`, `useAlert`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 6 | `showAlert` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(params: BaseAlertDialogProps) => void` |
| 7 | `closeAlert` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 15 | `useAlert` | function | Hook อ่านหรือควบคุม Alert; ดู implementation สำหรับ dependency และ side effect | `() =>` |

#### `src/context/alert-context/alert-provider.tsx`

บทบาท: React context/provider และ shared state. Exports: `AlertProvider`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 7 | `AlertProvider` | component | Provider ประกอบ state/actions แล้วส่งผ่าน React context | `({ children, }) =>` |
| 14 | `showAlertHandler` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(params) => {` |
| 21 | `closeAlertHandler` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

### `src/context/canvas-context`

#### `src/context/canvas-context/canvas-context.tsx`

บทบาท: React context/provider และ shared state. Exports: `CanvasContext`, `CanvasEvent`, `CanvasEventBase`, `CanvasEventType`, `PanClickEvent`, `canvasContext`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 25 | `reorderTables` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(options?: { updateHistory?: boolean }) => void` |
| 26 | `fitView` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(options?: { duration?: number; padding?: number; maxZoom?: number; }) => void` |
| 31 | `setOverlapGraph` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(graph: Graph<string>) => void` |
| 45 | `openRelationshipPopover` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(params: { relationshipId: string; position: { x: number; y: number }; }) => void` |
| 49 | `closeRelationshipPopover` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 64 | `startFloatingEdgeCreation` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `({ sourceNodeId, }: { sourceNodeId: string; }) => void` |
| 69 | `endFloatingEdgeCreation` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 72 | `showCreateRelationshipNode` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(params: { sourceTableId: string; targetTableId: string; x: number; y: number; }) => void` |
| 78 | `hideCreateRelationshipNode` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |

#### `src/context/canvas-context/canvas-provider.tsx`

บทบาท: React context/provider และ shared state. Exports: `CanvasProvider`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 30 | `CanvasProvider` | component | Provider ประกอบ state/actions แล้วส่งผ่าน React context | `({ children }: CanvasProviderProps) =>` |
| 86 | `reorderTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( options: { updateHistory?: boolean } = { updateHistory: true, } ) => {` |
| 118 | `newTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === table.id` |
| 155 | `startFloatingEdgeCreation` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ sourceNodeId }) =>` |
| 163 | `endFloatingEdgeCreation` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 168 | `hideCreateRelationshipNode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 176 | `openRelationshipPopover` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ relationshipId, position }) =>` |
| 181 | `closeRelationshipPopover` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 186 | `showCreateRelationshipNode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ sourceTableId, targetTableId, x, y }) => {` |
| 216 | `nodesWithoutOldCreateRelationshipNode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(n) => n.id !== CREATE_RELATION` |

### `src/context/chartdb-context`

#### `src/context/chartdb-context/chartdb-context.tsx`

บทบาท: React context/provider และ shared state. Exports: `AddFieldEvent`, `ChartDBContext`, `ChartDBEvent`, `ChartDBEventBase`, `ChartDBEventType`, `CreateTableEvent`, `LoadDiagramEvent`, `RemoveFieldEvent`, `RemoveTableEvent`, `UpdateTableEvent`, `chartDBContext`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 85 | `highlightCustomTypeId` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(id?: string) => void` |
| 88 | `updateDiagramId` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(id: string) => Promise<void>` |
| 89 | `updateDiagramName` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( name: string, options?: { updateHistory: boolean } ) => Promise<void>` |
| 93 | `loadDiagram` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(diagramId: string) => Promise<Diagram \| undefined>` |
| 94 | `loadDiagramFromData` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(diagram: Diagram) => void` |
| 95 | `updateDiagramUpdatedAt` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `() => Promise<void>` |
| 96 | `clearDiagramData` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `() => Promise<void>` |
| 97 | `deleteDiagram` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `() => Promise<void>` |
| 98 | `updateDiagramData` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( diagram: Diagram, options?: { forceUpdateStorage?: boolean } ) => Promise<void>` |
| 104 | `updateDatabaseType` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(databaseType: DatabaseType) => Promise<void>` |
| 105 | `updateDatabaseEdition` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(databaseEdition?: DatabaseEdition) => Promise<void>` |
| 108 | `createTable` | method | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `( attributes?: Partial<Omit<DBTable, 'id'>> ) => Promise<DBTable>` |
| 111 | `addTable` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( table: DBTable, options?: { updateHistory: boolean } ) => Promise<void>` |
| 115 | `addTables` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( tables: DBTable[], options?: { updateHistory: boolean } ) => Promise<void>` |
| 119 | `getTable` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(id: string) => DBTable \| null` |
| 120 | `removeTable` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( id: string, options?: { updateHistory: boolean } ) => Promise<void>` |
| 124 | `removeTables` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( ids: string[], options?: { updateHistory: boolean } ) => Promise<void>` |
| 128 | `updateTable` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( id: string, table: Partial<DBTable>, options?: { updateHistory: boolean } ) => Promise<void>` |
| 133 | `updateTablesState` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( updateFn: (tables: DBTable[]) => PartialExcept<DBTable, 'id'>[], options?: { updateHistory: boolean; forceOverride?: boolean } ) => Promise<void>` |
| 139 | `getField` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(tableId: string, fieldId: string) => DBField \| null` |
| 140 | `updateField` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( tableId: string, fieldId: string, field: Partial<DBField>, options?: { updateHistory: boolean } ) => Promise<void>` |
| 146 | `removeField` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( tableId: string, fieldId: string, options?: { updateHistory: boolean } ) => Promise<void>` |
| 151 | `createField` | method | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(tableId: string) => Promise<DBField>` |
| 152 | `addField` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( tableId: string, field: DBField, options?: { updateHistory: boolean } ) => Promise<void>` |
| 159 | `createIndex` | method | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(tableId: string) => Promise<DBIndex>` |
| 160 | `addIndex` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( tableId: string, index: DBIndex, options?: { updateHistory: boolean } ) => Promise<void>` |
| 165 | `getIndex` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(tableId: string, indexId: string) => DBIndex \| null` |
| 166 | `removeIndex` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( tableId: string, indexId: string, options?: { updateHistory: boolean } ) => Promise<void>` |
| 171 | `updateIndex` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( tableId: string, indexId: string, index: Partial<DBIndex>, options?: { updateHistory: boolean } ) => Promise<void>` |
| 179 | `createCheckConstraint` | method | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(tableId: string) => Promise<DBCheckConstraint>` |
| 180 | `addCheckConstraint` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( tableId: string, constraint: DBCheckConstraint, options?: { updateHistory: boolean } ) => Promise<void>` |
| 185 | `removeCheckConstraint` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( tableId: string, constraintId: string, options?: { updateHistory: boolean } ) => Promise<void>` |
| 190 | `updateCheckConstraint` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( tableId: string, constraintId: string, constraint: Partial<DBCheckConstraint>, options?: { updateHistory: boolean } ) => Promise<void>` |
| 198 | `createRelationship` | method | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(params: { sourceTableId: string; targetTableId: string; sourceFieldId: string; targetFieldId: string; }) => Promise<DBRelationship>` |
| 204 | `addRelationship` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( relationship: DBRelationship, options?: { updateHistory: boolean } ) => Promise<void>` |
| 208 | `addRelationships` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( relationships: DBRelationship[], options?: { updateHistory: boolean } ) => Promise<void>` |
| 212 | `getRelationship` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(id: string) => DBRelationship \| null` |
| 213 | `removeRelationship` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( id: string, options?: { updateHistory: boolean } ) => Promise<void>` |
| 217 | `removeRelationships` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( ids: string[], options?: { updateHistory: boolean } ) => Promise<void>` |
| 221 | `updateRelationship` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( id: string, relationship: Partial<DBRelationship>, options?: { updateHistory: boolean } ) => Promise<void>` |
| 228 | `createDependency` | method | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(params: { tableId: string; dependentTableId: string; }) => Promise<DBDependency>` |
| 232 | `addDependency` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( dependency: DBDependency, options?: { updateHistory: boolean } ) => Promise<void>` |
| 236 | `addDependencies` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( dependencies: DBDependency[], options?: { updateHistory: boolean } ) => Promise<void>` |
| 240 | `getDependency` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(id: string) => DBDependency \| null` |
| 241 | `removeDependency` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( id: string, options?: { updateHistory: boolean } ) => Promise<void>` |
| 245 | `removeDependencies` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( ids: string[], options?: { updateHistory: boolean } ) => Promise<void>` |
| 249 | `updateDependency` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( id: string, dependency: Partial<DBDependency>, options?: { updateHistory: boolean } ) => Promise<void>` |
| 256 | `createArea` | method | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(attributes?: Partial<Omit<Area, 'id'>>) => Promise<Area>` |
| 257 | `addArea` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( area: Area, options?: { updateHistory: boolean } ) => Promise<void>` |
| 261 | `addAreas` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( areas: Area[], options?: { updateHistory: boolean } ) => Promise<void>` |
| 265 | `getArea` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(id: string) => Area \| null` |
| 266 | `removeArea` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( id: string, options?: { updateHistory: boolean } ) => Promise<void>` |
| 270 | `removeAreas` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( ids: string[], options?: { updateHistory: boolean } ) => Promise<void>` |
| 274 | `updateArea` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( id: string, area: Partial<Area>, options?: { updateHistory: boolean } ) => Promise<void>` |
| 281 | `createNote` | method | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(attributes?: Partial<Omit<Note, 'id'>>) => Promise<Note>` |
| 282 | `addNote` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( note: Note, options?: { updateHistory: boolean } ) => Promise<void>` |
| 286 | `addNotes` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( notes: Note[], options?: { updateHistory: boolean } ) => Promise<void>` |
| 290 | `getNote` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(id: string) => Note \| null` |
| 291 | `removeNote` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( id: string, options?: { updateHistory: boolean } ) => Promise<void>` |
| 295 | `removeNotes` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( ids: string[], options?: { updateHistory: boolean } ) => Promise<void>` |
| 299 | `updateNote` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( id: string, note: Partial<Note>, options?: { updateHistory: boolean } ) => Promise<void>` |
| 306 | `createCustomType` | method | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `( attributes?: Partial<Omit<DBCustomType, 'id'>> ) => Promise<DBCustomType>` |
| 309 | `addCustomType` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( customType: DBCustomType, options?: { updateHistory: boolean } ) => Promise<void>` |
| 313 | `addCustomTypes` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( customTypes: DBCustomType[], options?: { updateHistory: boolean } ) => Promise<void>` |
| 317 | `getCustomType` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(id: string) => DBCustomType \| null` |
| 318 | `removeCustomType` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( id: string, options?: { updateHistory: boolean } ) => Promise<void>` |
| 322 | `removeCustomTypes` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( ids: string[], options?: { updateHistory: boolean } ) => Promise<void>` |
| 326 | `updateCustomType` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( id: string, customType: Partial<DBCustomType>, options?: { updateHistory: boolean } ) => Promise<void>` |

#### `src/context/chartdb-context/chartdb-provider.tsx`

บทบาท: React context/provider และ shared state. Exports: `ChartDBProvider`, `ChartDBProviderProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 43 | `ChartDBProvider` | component | Provider ประกอบ state/actions แล้วส่งผ่าน React context | `({ children, diagram, readonly: readonlyProp }) =>` |
| 80 | `diffCalculatedHandler` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(event: DiffCalculatedEvent) =>` |
| 100 | `defaultSchemaName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => defaultS` |
| 105 | `readonly` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => readonly` |
| 110 | `schemas` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 138 | `db` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => (readonl` |
| 143 | `currentDiagram` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => ({` |
| 174 | `clearDiagramData` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async () =>` |
| 199 | `deleteDiagram` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async () =>` |
| 225 | `updateDiagramUpdatedAt` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async () =>` |
| 235 | `updateDatabaseType` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (databaseType) => {` |
| 249 | `updateDatabaseEdition` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (databaseEdition) => {` |
| 263 | `updateDiagramId` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (id) => {` |
| 272 | `updateDiagramName` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (name, options = { updateHistory: true }) => {` |
| 302 | `addTables` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (tablesToAdd: DBTable[], options = { updateHistory: true }) => {` |
| 331 | `addTable` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (table: DBTable, options = { updateHistory: true }) => {` |
| 338 | `createTable` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async (attributes) => {` |
| 380 | `getTable` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(id: string) => tables.f` |
| 385 | `removeTables` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (ids, options) => {` |
| 387 | `tables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 388 | `relationshipsToRemove` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(relationship) =>` |
| 394 | `dependenciesToRemove` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dependency) =>` |
| 465 | `removeTable` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (id: string, options = { updateHistory: true }) => {` |
| 472 | `updateTable` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( id: string, table: Partial<DBTable>, options = { updateHistory: true } ) => {` |
| 515 | `updateTablesState` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( updateFn: (tables: DBTable[]) => PartialExcept<DBTable, 'id'>[], options = { updateHistory: true, forceOverride: false } ) => {` |
| 520 | `updateTables` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(prevTables: DBTable[]) =>` |
| 528 | `updatedTable` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(t) => t.id === prevTable.id` |
| 543 | `tablesToDelete` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) => !updatedTables.s` |
| 547 | `relationshipsToRemove` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(relationship) =>` |
| 555 | `dependenciesToRemove` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dependency) =>` |
| 648 | `getField` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(tableId: string, fieldId: string) => {` |
| 656 | `updateField` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( tableId: string, fieldId: string, field: Partial<DBField>, options = { updateHistory: true } ) => {` |
| 665 | `updateTableFn` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(table: DBTable) =>` |
| 723 | `removeField` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( tableId: string, fieldId: string, options = { updateHistory: true } ) => {` |
| 729 | `updateTableFn` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(table: DBTable) =>` |
| 801 | `addField` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( tableId: string, field: DBField, options = { updateHistory: true } ) => {` |
| 867 | `createField` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async (tableId: string) => {` |
| 887 | `getIndex` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(tableId: string, indexId: string) => {` |
| 895 | `addIndex` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( tableId: string, index: DBIndex, options = { updateHistory: true } ) => {` |
| 939 | `removeIndex` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( tableId: string, indexId: string, options = { updateHistory: true } ) => {` |
| 995 | `createIndex` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async (tableId: string) => {` |
| 1013 | `updateIndex` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( tableId: string, indexId: string, index: Partial<DBIndex>, options = { updateHistory: true } ) => {` |
| 1067 | `addCheckConstraint` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( tableId: string, constraint: DBCheckConstraint, options = { updateHistory: true } ) => {` |
| 1124 | `createCheckConstraint` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async (tableId: string) => {` |
| 1140 | `removeCheckConstraint` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( tableId: string, constraintId: string, options = { updateHistory: true } ) => {` |
| 1148 | `prevConstraint` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.id === constraintI` |
| 1200 | `updateCheckConstraint` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( tableId: string, constraintId: string, constraint: Partial<DBCheckConstraint>, options = { updateHistory: true } ) => {` |
| 1209 | `prevConstraint` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.id === constraintI` |
| 1273 | `addRelationships` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( relationships: DBRelationship[], options = { updateHistory: true } ) => {` |
| 1307 | `addRelationship` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( relationship: DBRelationship, options = { updateHistory: true } ) => {` |
| 1317 | `createRelationship` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async ({ sourceTableId, targetTableId, sourceFieldId, targetFieldId, }) => {` |
| 1328 | `sourceField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(field: { id: string }) => field.id === sourceF` |
| 1358 | `getRelationship` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(id: string) =>` |
| 1365 | `removeRelationships` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (ids: string[], options = { updateHistory: true }) => {` |
| 1411 | `removeRelationship` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (id: string, options = { updateHistory: true }) => {` |
| 1419 | `updateRelationship` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( id: string, relationship: Partial<DBRelationship>, options = { updateHistory: true } ) => {` |
| 1465 | `addDependencies` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( dependencies: DBDependency[], options = { updateHistory: true } ) => {` |
| 1499 | `addDependency` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (dependency: DBDependency, options = { updateHistory: true }) => {` |
| 1506 | `createDependency` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async ({ tableId, dependentTableId }) => {` |
| 1527 | `getDependency` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(id: string) =>` |
| 1533 | `removeDependencies` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (ids: string[], options = { updateHistory: true }) => {` |
| 1577 | `removeDependency` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (id: string, options = { updateHistory: true }) => {` |
| 1584 | `updateDependency` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( id: string, dependency: Partial<DBDependency>, options = { updateHistory: true } ) => {` |
| 1624 | `addAreas` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (areas: Area[], options = { updateHistory: true }) => {` |
| 1648 | `addArea` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (area: Area, options = { updateHistory: true }) => {` |
| 1655 | `createArea` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async (attributes) => {` |
| 1675 | `getArea` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(id: string) => areas.fi` |
| 1680 | `removeAreas` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (ids: string[], options = { updateHistory: true }) => {` |
| 1708 | `removeArea` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (id: string, options = { updateHistory: true }) => {` |
| 1715 | `updateArea` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( id: string, area: Partial<Area>, options = { updateHistory: true } ) => {` |
| 1748 | `addNotes` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (notes: Note[], options = { updateHistory: true }) => {` |
| 1772 | `addNote` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (note: Note, options = { updateHistory: true }) => {` |
| 1779 | `createNote` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async (attributes) => {` |
| 1799 | `getNote` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(id: string) => notes.fi` |
| 1804 | `removeNotes` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (ids: string[], options = { updateHistory: true }) => {` |
| 1832 | `removeNote` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (id: string, options = { updateHistory: true }) => {` |
| 1839 | `updateNote` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( id: string, note: Partial<Note>, options = { updateHistory: true } ) => {` |
| 1871 | `highlightCustomTypeId` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(id?: string) => setHighl` |
| 1876 | `highlightedCustomType` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 1882 | `loadDiagramFromData` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(diagram) => {` |
| 1924 | `updateDiagramData` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (diagram, options) => {` |
| 1934 | `loadDiagram` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async (diagramId: string) => {` |
| 1955 | `getCustomType` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(id: string) => customTy` |
| 1960 | `addCustomTypes` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( customTypes: DBCustomType[], options = { updateHistory: true } ) => {` |
| 1988 | `addCustomType` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (customType: DBCustomType, options = { updateHistory: true }) => {` |
| 1995 | `createCustomType` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async (attributes) => {` |
| 2012 | `removeCustomTypes` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (ids, options = { updateHistory: true }) => {` |
| 2053 | `removeCustomType` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (id: string, options = { updateHistory: true }) => {` |
| 2060 | `updateCustomType` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ( id: string, customType: Partial<DBCustomType>, options = { updateHistory: true } ) => {` |

### `src/context/config-context`

#### `src/context/config-context/config-context.tsx`

บทบาท: React context/provider และ shared state. Exports: `ConfigContext`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 7 | `updateConfig` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { config?: Partial<ChartDBConfig>; updateFn?: (config: ChartDBConfig) => ChartDBConfig; }) => Promise<void>` |
| 9 | `updateFn` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(config: ChartDBConfig) => ChartDBConfig` |

#### `src/context/config-context/config-provider.tsx`

บทบาท: React context/provider และ shared state. Exports: `ConfigProvider`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 7 | `ConfigProvider` | component | Provider ประกอบ state/actions แล้วส่งผ่าน React context | `({ children, }) =>` |
| 14 | `loadConfig` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async () =>` |
| 22 | `updateConfig` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ config, updateFn, }) =>` |

### `src/context/diagram-filter-context`

#### `src/context/diagram-filter-context/diagram-filter-context.tsx`

บทบาท: React context/provider และ shared state. Exports: `DiagramFilterContext`, `diagramFilterContext`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 16 | `clearSchemaIdsFilter` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `() => void` |
| 17 | `clearTableIdsFilter` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `() => void` |
| 19 | `setTableIdsFilterEmpty` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `() => void` |
| 22 | `resetFilter` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `() => void` |
| 24 | `toggleSchemaFilter` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(schemaId: string) => void` |
| 25 | `toggleTableFilter` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(tableId: string) => void` |
| 26 | `addSchemaToFilter` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(schemaId: string) => void` |
| 27 | `addTablesToFilter` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(attrs: { tableIds?: string[]; filterCallback?: (table: FilterTableInfo) => boolean; }) => void` |
| 29 | `filterCallback` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(table: FilterTableInfo) => boolean` |
| 31 | `removeTablesFromFilter` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(attrs: { tableIds?: string[]; filterCallback?: (table: FilterTableInfo) => boolean; }) => void` |
| 33 | `filterCallback` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(table: FilterTableInfo) => boolean` |

#### `src/context/diagram-filter-context/diagram-filter-provider.tsx`

บทบาท: React context/provider และ shared state. Exports: `DiagramFilterProvider`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 25 | `DiagramFilterProvider` | component | Provider ประกอบ state/actions แล้วส่งผ่าน React context | `({ children, }) =>` |
| 33 | `allSchemasIds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 37 | `allTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 68 | `loadFilterFromStorage` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async (diagramId: string) =>` |
| 96 | `clearSchemaIds` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |
| 107 | `clearTableIds` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |
| 118 | `setTableIdsEmpty` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |
| 130 | `resetFilter` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |
| 134 | `toggleSchemaFilter` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(schemaId: string) => {` |
| 175 | `schemaTableIds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) =>` |
| 190 | `schemaTableIds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) =>` |
| 219 | `toggleTableFilterForNoSchema` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(tableId: string) => {` |
| 270 | `toggleTableFilter` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(tableId: string) => {` |
| 281 | `tableInfo` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 316 | `otherTablesFromSchema` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 362 | `addSchemaToFilter` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(schemaId: string) => {` |
| 396 | `hasActiveFilter` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 400 | `schemasDisplayed` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 431 | `addTablesToFilter` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `({ tableIds, filterCallback }) => {` |
| 476 | `removeTablesFromFilter` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `({ tableIds, filterCallback }) => {` |
| 501 | `newTableIds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(id) => !tableIdsToRemovoe.inclu` |
| 521 | `eventConsumer` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(event: ChartDBEvent) => {` |

#### `src/context/diagram-filter-context/use-diagram-filter.ts`

บทบาท: React context/provider และ shared state. Exports: `useDiagramFilter`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `useDiagramFilter` | function | Hook อ่านหรือควบคุม DiagramFilter; ดู implementation สำหรับ dependency และ side effect | `() =>` |

### `src/context/dialog-context`

#### `src/context/dialog-context/dialog-context.tsx`

บทบาท: React context/provider และ shared state. Exports: `DialogContext`, `dialogContext`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 15 | `openCreateDiagramDialog` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `( params?: Omit<CreateDiagramDialogProps, 'dialog'> ) => void` |
| 18 | `closeCreateDiagramDialog` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 21 | `openOpenDiagramDialog` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `( params?: Omit<OpenDiagramDialogProps, 'dialog'> ) => void` |
| 24 | `closeOpenDiagramDialog` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 27 | `openExportSQLDialog` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(params: Omit<ExportSQLDialogProps, 'dialog'>) => void` |
| 28 | `closeExportSQLDialog` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 31 | `openCreateRelationshipDialog` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `( params?: Omit<CreateRelationshipDialogProps, 'dialog'> ) => void` |
| 34 | `closeCreateRelationshipDialog` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 37 | `openImportDatabaseDialog` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `( params: Omit<ImportDatabaseDialogProps, 'dialog'> ) => void` |
| 40 | `closeImportDatabaseDialog` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 43 | `openTableSchemaDialog` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `( params: Omit<TableSchemaDialogProps, 'dialog'> ) => void` |
| 46 | `closeTableSchemaDialog` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 49 | `openStarUsDialog` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 50 | `closeStarUsDialog` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 53 | `openExportImageDialog` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `( params: Omit<ExportImageDialogProps, 'dialog'> ) => void` |
| 56 | `closeExportImageDialog` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 59 | `openExportDiagramDialog` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `( params: Omit<ExportDiagramDialogProps, 'dialog'> ) => void` |
| 62 | `closeExportDiagramDialog` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 65 | `openImportDiagramDialog` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `( params: Omit<ImportDiagramDialogProps, 'dialog'> ) => void` |
| 68 | `closeImportDiagramDialog` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |

#### `src/context/dialog-context/dialog-provider.tsx`

บทบาท: React context/provider และ shared state. Exports: `DialogProvider`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 24 | `DialogProvider` | component | Provider ประกอบ state/actions แล้วส่งผ่าน React context | `({ children, }) =>` |
| 30 | `openNewDiagramDialogHandler` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(props) => {` |
| 43 | `openOpenDiagramDialogHandler` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(props) => {` |
| 56 | `openCreateRelationshipDialogHandler` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(params) => {` |
| 72 | `openExportImageDialogHandler` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(params) => {` |
| 86 | `openExportSQLDialogHandler` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ targetDatabaseType }) => {` |
| 102 | `openImportDatabaseDialogHandler` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ databaseType, importMethods, initialImportMethod }) => {` |
| 120 | `openTableSchemaDialogHandler` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(params) => {` |

### `src/context/diff-context`

#### `src/context/diff-context/diff-context.tsx`

บทบาท: React context/provider และ shared state. Exports: `DiffCalculatedData`, `DiffCalculatedEvent`, `DiffContext`, `DiffEvent`, `DiffEventBase`, `DiffEventType`, `diffContext`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 40 | `calculateDiff` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `({ diagram, newDiagram, options, }: { diagram: Diagram; newDiagram: Diagram; options?: { summaryOnly?: boolean; }; }) => { foundDiff: boolean }` |
| 51 | `resetDiff` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `() => void` |
| 54 | `checkIfTableHasChange` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `({ tableId }: { tableId: string }) => boolean` |
| 55 | `checkIfNewTable` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `({ tableId }: { tableId: string }) => boolean` |
| 56 | `checkIfTableRemoved` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `({ tableId }: { tableId: string }) => boolean` |
| 57 | `getTableNewName` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ tableId }: { tableId: string }) => { old: string; new: string; } \| null` |
| 61 | `getTableNewColor` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ tableId }: { tableId: string }) => { old: string; new: string; } \| null` |
| 67 | `checkIfFieldHasChange` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `({ tableId, fieldId, }: { tableId: string; fieldId: string; }) => boolean` |
| 74 | `checkIfFieldRemoved` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `({ fieldId }: { fieldId: string }) => boolean` |
| 75 | `checkIfNewField` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `({ fieldId }: { fieldId: string }) => boolean` |
| 76 | `getFieldNewName` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ fieldId, }: { fieldId: string; }) => { old: string; new: string } \| null` |
| 81 | `getFieldNewType` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ fieldId, }: { fieldId: string; }) => { old: DataType; new: DataType } \| null` |
| 86 | `getFieldNewPrimaryKey` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ fieldId, }: { fieldId: string; }) => { old: boolean; new: boolean } \| null` |
| 91 | `getFieldNewNullable` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ fieldId, }: { fieldId: string; }) => { old: boolean; new: boolean } \| null` |
| 96 | `getFieldNewCharacterMaximumLength` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ fieldId, }: { fieldId: string; }) => { old: string; new: string } \| null` |
| 101 | `getFieldNewScale` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ fieldId, }: { fieldId: string; }) => { old: number; new: number } \| null` |
| 106 | `getFieldNewPrecision` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ fieldId, }: { fieldId: string; }) => { old: number; new: number } \| null` |
| 111 | `getFieldNewIsArray` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ fieldId, }: { fieldId: string; }) => { old: boolean; new: boolean } \| null` |
| 118 | `checkIfRelationshipHasChange` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `({ relationshipId, }: { relationshipId: string; }) => boolean` |
| 123 | `checkIfNewRelationship` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `({ relationshipId, }: { relationshipId: string; }) => boolean` |
| 128 | `checkIfRelationshipRemoved` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `({ relationshipId, }: { relationshipId: string; }) => boolean` |
| 133 | `getRelationshipNewName` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ relationshipId, }: { relationshipId: string; }) => { old: string; new: string } \| null` |
| 140 | `checkIfNewArea` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `({ areaId }: { areaId: string }) => boolean` |
| 141 | `checkIfAreaRemoved` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `({ areaId }: { areaId: string }) => boolean` |

#### `src/context/diff-context/diff-provider.tsx`

บทบาท: React context/provider และ shared state. Exports: `DiffProvider`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 21 | `DiffProvider` | component | Provider ประกอบ state/actions แล้วส่งผ่าน React context | `({ children, }) =>` |
| 46 | `generateFieldsToAddMap` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `({ diffMap, newDiagram, }: { diffMap: DiffMap; newDiagram: Diagram; }) => {` |
| 58 | `field` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 76 | `findRelationshipsToAdd` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ diffMap, newDiagram, }: { diffMap: DiffMap; newDiagram: Diagram; }) => {` |
| 87 | `relationship` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(rel) => rel.id === diff.newRelat` |
| 102 | `findAreasToAdd` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ diffMap, newDiagram, }: { diffMap: DiffMap; newDiagram: Diagram; }) => {` |
| 113 | `area` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a) => a.id === diff.areaAdded.` |
| 128 | `generateDiffCalculatedData` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `({ newDiagram, diffMap, }: { newDiagram: Diagram; diffMap: DiffMap; }): DiffCalculatedData => {` |
| 167 | `calculateDiff` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ diagram, newDiagram: newDiagramArg, options }) => {` |
| 199 | `getTableNewName` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ tableId }) => {` |
| 223 | `getTableNewColor` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ tableId }) => {` |
| 246 | `checkIfTableHasChange` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ tableId }) =>` |
| 250 | `checkIfNewTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ tableId }) => {` |
| 264 | `checkIfTableRemoved` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ tableId }) => {` |
| 279 | `checkIfFieldHasChange` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ fieldId }) => {` |
| 288 | `checkIfFieldRemoved` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ fieldId }) => {` |
| 303 | `checkIfNewField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ fieldId }) => {` |
| 317 | `getFieldNewName` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ fieldId }) => {` |
| 341 | `getFieldNewType` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ fieldId }) => {` |
| 365 | `getFieldNewPrimaryKey` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ fieldId }) => {` |
| 391 | `getFieldNewNullable` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ fieldId }) => {` |
| 415 | `getFieldNewCharacterMaximumLength` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ fieldId }) => {` |
| 441 | `getFieldNewScale` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ fieldId }) => {` |
| 465 | `getFieldNewPrecision` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ fieldId }) => {` |
| 491 | `getFieldNewIsArray` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ fieldId }) => {` |
| 515 | `checkIfRelationshipHasChange` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ relationshipId }) =>` |
| 523 | `getRelationshipNewName` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ relationshipId }) => {` |
| 571 | `checkIfNewRelationship` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ relationshipId }) => {` |
| 588 | `checkIfRelationshipRemoved` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ relationshipId }) => {` |
| 605 | `checkIfNewArea` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ areaId }) => {` |
| 619 | `checkIfAreaRemoved` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ areaId }) => {` |
| 633 | `resetDiff` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |

#### `src/context/diff-context/use-diff.ts`

บทบาท: React context/provider และ shared state. Exports: `useDiff`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `useDiff` | function | Hook อ่านหรือควบคุม Diff; ดู implementation สำหรับ dependency และ side effect | `() =>` |

### `src/context/export-image-context`

#### `src/context/export-image-context/export-image-context.tsx`

บทบาท: React context/provider และ shared state. Exports: `ExportImageContext`, `ImageType`, `exportImageContext`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 6 | `exportImage` | method | สร้าง representation สำหรับแสดงผลหรือส่งออก | `( type: ImageType, options: { includePatternBG: boolean; transparent: boolean; scale: number; } ) => Promise<void>` |

#### `src/context/export-image-context/export-image-provider.tsx`

บทบาท: React context/provider และ shared state. Exports: `ExportImageProvider`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 13 | `ExportImageProvider` | component | Provider ประกอบ state/actions แล้วส่งผ่าน React context | `({ children, }) =>` |
| 39 | `downloadImage` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dataUrl: string, type: ImageType) => {` |
| 49 | `imageCreatorMap` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => ({` |
| 61 | `getBackgroundColor` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(theme: EffectiveTheme, transparent: boolean): string => {` |
| 69 | `exportImage` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `async (type, { includePatternBG, transparent, scale }) => {` |

### `src/context/full-screen-spinner-context`

#### `src/context/full-screen-spinner-context/full-screen-spinner-context.tsx`

บทบาท: React context/provider และ shared state. Exports: `FullScreenLoaderContext`, `fullScreenLoaderContext`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 5 | `showLoader` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(options?: { animated?: boolean }) => void` |
| 6 | `hideLoader` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |

#### `src/context/full-screen-spinner-context/full-screen-spinner-provider.tsx`

บทบาท: React context/provider และ shared state. Exports: `FullScreenLoaderProvider`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 13 | `FullScreenLoaderProvider` | component | Provider ประกอบ state/actions แล้วส่งผ่าน React context | `({ children, }) =>` |
| 19 | `hideLoader` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 24 | `showLoader` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(options) => {` |

### `src/context/history-context`

#### `src/context/history-context/history-context.tsx`

บทบาท: React context/provider และ shared state. Exports: `HistoryContext`, `historyContext`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 5 | `undo` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 6 | `redo` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |

#### `src/context/history-context/history-provider.tsx`

บทบาท: React context/provider และ shared state. Exports: `HistoryProvider`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 7 | `HistoryProvider` | component | Provider ประกอบ state/actions แล้วส่งผ่าน React context | `({ children, }) =>` |
| 50 | `redoActionHandlers` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(): RedoUndoActionHandlers => ({` |
| 211 | `undoActionHandlers` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(): RedoUndoActionHandlers => ({` |
| 384 | `undo` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async () =>` |
| 399 | `redo` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async () =>` |

#### `src/context/history-context/redo-undo-action.ts`

บทบาท: React context/provider และ shared state. Exports: `RedoActionData`, `RedoUndoAction`, `RedoUndoActionHandlers`, `UndoActionData`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/context/history-context/redo-undo-stack-context.tsx`

บทบาท: React context/provider และ shared state. Exports: `RedoUndoStackContext`, `redoUndoStackContext`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 8 | `addRedoAction` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(action: RedoUndoAction) => void` |
| 9 | `addUndoAction` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(action: RedoUndoAction) => void` |
| 10 | `resetRedoStack` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `() => void` |
| 11 | `resetUndoStack` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `() => void` |

#### `src/context/history-context/redo-undo-stack-provider.tsx`

บทบาท: React context/provider และ shared state. Exports: `RedoUndoStackProvider`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 6 | `RedoUndoStackProvider` | component | Provider ประกอบ state/actions แล้วส่งผ่าน React context | `({ children, }) =>` |
| 12 | `addRedoAction` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(action) => {` |
| 19 | `addUndoAction` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(action) => {` |
| 26 | `resetRedoStack` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |
| 31 | `resetUndoStack` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |

### `src/context/keyboard-shortcuts-context`

#### `src/context/keyboard-shortcuts-context/keyboard-shortcuts-context.tsx`

บทบาท: React context/provider และ shared state. Exports: `KeyboardShortcutsContext`, `keyboardShortcutsContext`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/context/keyboard-shortcuts-context/keyboard-shortcuts-provider.tsx`

บทบาท: React context/provider และ shared state. Exports: `KeyboardShortcutsProvider`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 14 | `KeyboardShortcutsProvider` | component | Provider ประกอบ state/actions แล้วส่งผ่าน React context | `({ children, }) =>` |

#### `src/context/keyboard-shortcuts-context/keyboard-shortcuts.ts`

บทบาท: React context/provider และ shared state. Exports: `KeyboardShortcut`, `KeyboardShortcutAction`, `KeyboardShortcutForOS`, `keyboardShortcuts`, `keyboardShortcutsForOS`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 92 | `keyboardShortcutsForOS` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(acc, action) => {` |

### `src/context/layout-context`

#### `src/context/layout-context/layout-context.tsx`

บทบาท: React context/provider และ shared state. Exports: `LayoutContext`, `SidebarSection`, `VisualsTab`, `layoutContext`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 15 | `openTableFromSidebar` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(tableId: string) => void` |
| 16 | `closeAllTablesInSidebar` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 18 | `openRelationshipFromSidebar` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(relationshipId: string) => void` |
| 19 | `closeAllRelationshipsInSidebar` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 21 | `openDependencyFromSidebar` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(dependencyId: string) => void` |
| 22 | `closeAllDependenciesInSidebar` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 25 | `openRefFromSidebar` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(refId: string) => void` |
| 26 | `closeAllRefsInSidebar` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 29 | `openAreaFromSidebar` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(areaId: string) => void` |
| 30 | `closeAllAreasInSidebar` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 33 | `openNoteFromSidebar` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(noteId: string) => void` |
| 34 | `closeAllNotesInSidebar` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 37 | `openCustomTypeFromSidebar` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(customTypeId: string) => void` |
| 38 | `closeAllCustomTypesInSidebar` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 41 | `selectSidebarSection` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(section: SidebarSection) => void` |
| 44 | `selectVisualsTab` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(tab: VisualsTab) => void` |
| 47 | `hideSidePanel` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 48 | `showSidePanel` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 49 | `toggleSidePanel` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `() => void` |

#### `src/context/layout-context/layout-provider.tsx`

บทบาท: React context/provider และ shared state. Exports: `LayoutProvider`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 10 | `LayoutProvider` | component | Provider ประกอบ state/actions แล้วส่งผ่าน React context | `({ children, }) =>` |
| 35 | `closeAllTablesInSidebar` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => setOpene` |
| 38 | `closeAllRelationshipsInSidebar` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => setOpene` |
| 41 | `closeAllDependenciesInSidebar` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => setOpene` |
| 44 | `closeAllRefsInSidebar` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 47 | `closeAllAreasInSidebar` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => setOpene` |
| 50 | `closeAllNotesInSidebar` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => setOpene` |
| 53 | `closeAllCustomTypesInSidebar` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => setOpene` |
| 56 | `hideSidePanel` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 59 | `showSidePanel` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 62 | `toggleSidePanel` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |
| 66 | `openTableFromSidebar` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( tableId ) =>` |
| 74 | `openRelationshipFromSidebar` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(relationshipId) => {` |
| 81 | `openDependencyFromSidebar` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dependencyId) => {` |
| 88 | `openRefFromSidebar` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(refId) =>` |
| 94 | `openAreaFromSidebar` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( areaId ) =>` |
| 103 | `openNoteFromSidebar` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( noteId ) =>` |
| 112 | `openCustomTypeFromSidebar` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(customTypeId) => {` |

### `src/context/local-config-context`

#### `src/context/local-config-context/local-config-context.tsx`

บทบาท: React context/provider และ shared state. Exports: `LocalConfigContext`, `ScrollAction`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 9 | `setTheme` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(theme: Theme) => void` |
| 12 | `setScrollAction` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(action: ScrollAction) => void` |
| 15 | `setShowDBViews` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(showViews: boolean) => void` |
| 18 | `setShowCardinality` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(showCardinality: boolean) => void` |
| 21 | `setShowFieldAttributes` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(showFieldAttributes: boolean) => void` |
| 24 | `setGithubRepoOpened` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(githubRepoOpened: boolean) => void` |
| 27 | `setStarUsDialogLastOpen` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(lastOpen: number) => void` |
| 30 | `setShowMiniMapOnCanvas` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(showMiniMapOnCanvas: boolean) => void` |

#### `src/context/local-config-context/local-config-provider.tsx`

บทบาท: React context/provider และ shared state. Exports: `LocalConfigProvider`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 15 | `LocalConfigProvider` | component | Provider ประกอบ state/actions แล้วส่งผ่าน React context | `({ children, }) =>` |

### `src/context/storage-context`

#### `src/context/storage-context/storage-context.tsx`

บทบาท: React context/provider และ shared state. Exports: `StorageContext`, `storageContext`, `storageInitialValue`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 15 | `getConfig` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `() => Promise<ChartDBConfig \| undefined>` |
| 16 | `updateConfig` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(config: Partial<ChartDBConfig>) => Promise<void>` |
| 19 | `getDiagramFilter` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(diagramId: string) => Promise<DiagramFilter \| undefined>` |
| 20 | `updateDiagramFilter` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `( diagramId: string, filter: DiagramFilter ) => Promise<void>` |
| 24 | `deleteDiagramFilter` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(diagramId: string) => Promise<void>` |
| 27 | `addDiagram` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { diagram: Diagram }) => Promise<void>` |
| 28 | `listDiagrams` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(options?: { includeTables?: boolean; includeRelationships?: boolean; includeDependencies?: boolean; includeAreas?: boolean; includeCustomTypes?: boolean; includeNotes?: boolean; }) => Promise<Diagram[]>` |
| 36 | `getDiagram` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( id: string, options?: { includeTables?: boolean; includeRelationships?: boolean; includeDependencies?: boolean; includeAreas?: boolean; includeCustomTypes?: boolean; includeNotes?: boolean; } ) => Promise<Diagram \|...` |
| 47 | `updateDiagram` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { id: string; attributes: Partial<Diagram>; }) => Promise<void>` |
| 51 | `deleteDiagram` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(id: string) => Promise<void>` |
| 54 | `addTable` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { diagramId: string; table: DBTable }) => Promise<void>` |
| 55 | `getTable` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(params: { diagramId: string; id: string; }) => Promise<DBTable \| undefined>` |
| 59 | `updateTable` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { id: string; attributes: Partial<DBTable>; }) => Promise<void>` |
| 63 | `putTable` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(params: { diagramId: string; table: DBTable }) => Promise<void>` |
| 64 | `deleteTable` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { diagramId: string; id: string }) => Promise<void>` |
| 65 | `listTables` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(diagramId: string) => Promise<DBTable[]>` |
| 66 | `deleteDiagramTables` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(diagramId: string) => Promise<void>` |
| 69 | `addRelationship` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { diagramId: string; relationship: DBRelationship; }) => Promise<void>` |
| 73 | `getRelationship` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(params: { diagramId: string; id: string; }) => Promise<DBRelationship \| undefined>` |
| 77 | `updateRelationship` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { id: string; attributes: Partial<DBRelationship>; }) => Promise<void>` |
| 81 | `deleteRelationship` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { diagramId: string; id: string; }) => Promise<void>` |
| 85 | `listRelationships` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(diagramId: string) => Promise<DBRelationship[]>` |
| 86 | `deleteDiagramRelationships` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(diagramId: string) => Promise<void>` |
| 89 | `addDependency` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { diagramId: string; dependency: DBDependency; }) => Promise<void>` |
| 93 | `getDependency` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(params: { diagramId: string; id: string; }) => Promise<DBDependency \| undefined>` |
| 97 | `updateDependency` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { id: string; attributes: Partial<DBDependency>; }) => Promise<void>` |
| 101 | `deleteDependency` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { diagramId: string; id: string; }) => Promise<void>` |
| 105 | `listDependencies` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(diagramId: string) => Promise<DBDependency[]>` |
| 106 | `deleteDiagramDependencies` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(diagramId: string) => Promise<void>` |
| 109 | `addArea` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { diagramId: string; area: Area }) => Promise<void>` |
| 110 | `getArea` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(params: { diagramId: string; id: string; }) => Promise<Area \| undefined>` |
| 114 | `updateArea` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { id: string; attributes: Partial<Area>; }) => Promise<void>` |
| 118 | `deleteArea` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { diagramId: string; id: string }) => Promise<void>` |
| 119 | `listAreas` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(diagramId: string) => Promise<Area[]>` |
| 120 | `deleteDiagramAreas` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(diagramId: string) => Promise<void>` |
| 123 | `addCustomType` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { diagramId: string; customType: DBCustomType; }) => Promise<void>` |
| 127 | `getCustomType` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(params: { diagramId: string; id: string; }) => Promise<DBCustomType \| undefined>` |
| 131 | `updateCustomType` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { id: string; attributes: Partial<DBCustomType>; }) => Promise<void>` |
| 135 | `deleteCustomType` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { diagramId: string; id: string; }) => Promise<void>` |
| 139 | `listCustomTypes` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(diagramId: string) => Promise<DBCustomType[]>` |
| 140 | `deleteDiagramCustomTypes` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(diagramId: string) => Promise<void>` |
| 143 | `addNote` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { diagramId: string; note: Note }) => Promise<void>` |
| 144 | `getNote` | method | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(params: { diagramId: string; id: string; }) => Promise<Note \| undefined>` |
| 148 | `updateNote` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { id: string; attributes: Partial<Note>; }) => Promise<void>` |
| 152 | `deleteNote` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(params: { diagramId: string; id: string }) => Promise<void>` |
| 153 | `listNotes` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(diagramId: string) => Promise<Note[]>` |
| 154 | `deleteDiagramNotes` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(diagramId: string) => Promise<void>` |

#### `src/context/storage-context/storage-provider.tsx`

บทบาท: React context/provider และ shared state. Exports: `StorageProvider`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 16 | `StorageProvider` | component | Provider ประกอบ state/actions แล้วส่งผ่าน React context | `({ children, }) =>` |
| 19 | `db` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 256 | `getConfig` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `async (): Promise<ChartDBConfig \| undefined> =>` |
| 261 | `updateConfig` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (config) => {` |
| 268 | `getDiagramFilter` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `async (diagramId: string): Promise<DiagramFilter \| undefined> => {` |
| 277 | `updateDiagramFilter` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (diagramId, filter): Promise<void> => {` |
| 288 | `deleteDiagramFilter` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (diagramId: string): Promise<void> => {` |
| 296 | `addTable` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ diagramId, table }) => {` |
| 306 | `getTable` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `async ({ id, diagramId }): Promise<DBTable \| undefined> => {` |
| 313 | `deleteDiagramTables` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (diagramId) => {` |
| 324 | `updateTable` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ id, attributes }) => {` |
| 331 | `putTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async ({ diagramId, table }) => {` |
| 338 | `deleteTable` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ id, diagramId }) => {` |
| 345 | `listTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async (diagramId): Promise<DBTable[]> => {` |
| 358 | `addRelationship` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ diagramId, relationship }) => {` |
| 368 | `deleteDiagramRelationships` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (diagramId) => {` |
| 379 | `getRelationship` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `async ({ id, diagramId }): Promise<DBRelationship \| undefined> => {` |
| 386 | `updateRelationship` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ id, attributes }) => {` |
| 394 | `deleteRelationship` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ id, diagramId }) => {` |
| 402 | `listRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async (diagramId): Promise<DBRelationship[]> => {` |
| 417 | `addDependency` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ diagramId, dependency }) => {` |
| 427 | `getDependency` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `async ({ diagramId, id }) => {` |
| 434 | `updateDependency` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ id, attributes }) => {` |
| 441 | `deleteDependency` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ diagramId, id }) => {` |
| 448 | `listDependencies` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async (diagramId) => {` |
| 458 | `deleteDiagramDependencies` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (diagramId) => {` |
| 469 | `addArea` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ area, diagramId }) => {` |
| 479 | `getArea` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `async ({ diagramId, id }) => {` |
| 486 | `updateArea` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ id, attributes }) => {` |
| 493 | `deleteArea` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ diagramId, id }) => {` |
| 500 | `listAreas` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async (diagramId) => {` |
| 510 | `deleteDiagramAreas` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (diagramId) => {` |
| 519 | `addCustomType` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ diagramId, customType }) => {` |
| 529 | `getCustomType` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `async ({ diagramId, id }): Promise<DBCustomType \| undefined> => {` |
| 536 | `updateCustomType` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ id, attributes }) => {` |
| 543 | `deleteCustomType` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ diagramId, id }) => {` |
| 550 | `listCustomTypes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async (diagramId): Promise<DBCustomType[]> => {` |
| 564 | `deleteDiagramCustomTypes` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (diagramId) => {` |
| 576 | `addNote` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ note, diagramId }) => {` |
| 586 | `getNote` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `async ({ diagramId, id }) => {` |
| 593 | `updateNote` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ id, attributes }) => {` |
| 600 | `deleteNote` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ diagramId, id }) => {` |
| 607 | `listNotes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async (diagramId) => {` |
| 617 | `deleteDiagramNotes` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (diagramId) => {` |
| 625 | `addDiagram` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ diagram }) => {` |
| 690 | `listDiagrams` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async ( options = { includeRelationships: false, includeTables: false, includeDependencies: false, includeAreas: false, includeCustomTypes: false, includeNotes: false, } ): Promise<Diagram[]> => {` |
| 774 | `getDiagram` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `async ( id, options = { includeRelationships: false, includeTables: false, includeDependencies: false, includeAreas: false, includeCustomTypes: false, includeNotes: false, } ): Promise<Diagram \| undefined> => {` |
| 829 | `updateDiagram` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async ({ id, attributes }) => {` |
| 863 | `deleteDiagram` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async (id) => {` |

### `src/context/theme-context`

#### `src/context/theme-context/theme-context.tsx`

บทบาท: React context/provider และ shared state. Exports: `ThemeContext`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 8 | `setTheme` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(theme: Theme) => void` |

#### `src/context/theme-context/theme-provider.tsx`

บทบาท: React context/provider และ shared state. Exports: `ThemeProvider`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 12 | `ThemeProvider` | component | Provider ประกอบ state/actions แล้วส่งผ่าน React context | `({ children, }) =>` |
| 37 | `handleThemeToggle` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |

### `src/dialogs/base-alert-dialog`

#### `src/dialogs/base-alert-dialog/base-alert-dialog.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `BaseAlertDialog`, `BaseAlertDialogProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 20 | `onAction` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |
| 22 | `onClose` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |
| 26 | `BaseAlertDialog` | component | React component แสดง UI และประสาน props/context/event | `({ title, description, actionLabel, closeLabel, onAction, dialog, content, onClose, }) =>` |
| 38 | `closeAlertHandler` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 43 | `alertHandler` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

### `src/dialogs/common`

#### `src/dialogs/common/base-dialog-props.ts`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `BaseDialogProps`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/dialogs/common/import-database/import-database.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `ImportDatabase`, `ImportDatabaseProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 56 | `calculateContentSizeMB` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(content: string): number =>` |
| 60 | `calculateIsLargeFile` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(content: string): boolean =>` |
| 69 | `goBack` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 70 | `onImport` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |
| 71 | `onCreateEmptyDiagram` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |
| 82 | `setImportMethod` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(method: ImportMethod) => void` |
| 86 | `ImportDatabase` | component | React component แสดง UI และประสาน props/context/event | `({ setScriptResult, goBack, scriptResult, onImport, onCreateEmptyDiagram, databaseType, databaseEdition, setDatabaseEdition, keepDialogAfterImport, title, importMethod, setImportMethod, importMethods, }) =>` |
| 120 | `clearDecorations` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |
| 291 | `handleImport` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 297 | `handleAutoFix` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 314 | `handleErrorClick` | function | Event handler เชื่อม user/system event กับ state action | `(line: number) =>` |
| 323 | `formatEditor` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() =>` |
| 343 | `handleInputChange` | function | Event handler เชื่อม user/system event กับ state action | `(inputValue) => {` |
| 357 | `handleCheckJson` | function | Event handler เชื่อม user/system event กับ state action | `async () =>` |
| 395 | `handleEditorDidMount` | function | Event handler เชื่อม user/system event กับ state action | `(editor: editor.IStandaloneCodeEditor) => {` |
| 408 | `disposable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 453 | `renderHeader` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() =>` |
| 462 | `renderInstructions` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() => (` |
| 487 | `renderOutputTextArea` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() => (` |
| 573 | `renderContent` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() =>` |
| 604 | `renderFooter` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() =>` |

#### `src/dialogs/common/import-database/instructions-section/instructions-section.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `InstructionsSection`, `InstructionsSectionProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 36 | `setImportMethod` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(method: ImportMethod) => void` |
| 38 | `setShowSSMSInfoDialog` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(show: boolean) => void` |
| 44 | `InstructionsSection` | component | React component แสดง UI และประสาน props/context/event | `({ databaseType, databaseEdition, setDatabaseEdition, importMethod, setImportMethod, setShowSSMSInfoDialog, showSSMSInfoDialog, importMethods = defaultImportMethods, }) =>` |
| 56 | `showSmartQuery` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => importMe` |
| 60 | `showDDL` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => importMe` |
| 64 | `showDBML` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => importMe` |

#### `src/dialogs/common/import-database/instructions-section/instructions/dbml-instructions.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `DBMLInstructions`, `DBMLInstructionsProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 12 | `DBMLInstructions` | component | React component แสดง UI และประสาน props/context/event | `() =>` |

#### `src/dialogs/common/import-database/instructions-section/instructions/ddl-instruction-step.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `DDLInstructionStep`, `DDLInstructionStepProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 11 | `DDLInstructionStep` | component | React component แสดง UI และประสาน props/context/event | `({ index, text, code, example, }) =>` |

#### `src/dialogs/common/import-database/instructions-section/instructions/ddl-instructions.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `DDLInstructions`, `DDLInstructionsProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 102 | `DDLInstructions` | component | React component แสดง UI และประสาน props/context/event | `({ databaseType, }) =>` |

#### `src/dialogs/common/import-database/instructions-section/instructions/smart-query-instructions.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `SmartQueryInstructions`, `SmartQueryInstructionsProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 21 | `setShowSSMSInfoDialog` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(show: boolean) => void` |
| 24 | `SmartQueryInstructions` | component | React component แสดง UI และประสาน props/context/event | `({ databaseType, databaseEdition, showSSMSInfoDialog, setShowSSMSInfoDialog, }) =>` |
| 30 | `databaseClients` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => [` |
| 46 | `code` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 66 | `loadScripts` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async () =>` |

#### `src/dialogs/common/import-database/instructions-section/instructions/ssms-info/ssms-info.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `SSMSInfo`, `SSMSInfoProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 15 | `setOpen` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(open: boolean) => void` |
| 18 | `SSMSInfo` | component | React component แสดง UI และประสาน props/context/event | `({ open: controlledOpen, setOpen: setControlledOpen }, ref) =>` |
| 31 | `closeHandler` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 36 | `isOpen` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() => open \|\|` |

#### `src/dialogs/common/import-database/sql-validation-status.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `SQLValidationStatus`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 13 | `onErrorClick` | method | Event handler เชื่อม user/system event กับ state action | `(line: number) => void` |
| 17 | `SQLValidationStatus` | component | React component แสดง UI และประสาน props/context/event | `({ validation, errorMessage, isAutoFixing = false, onErrorClick, importMethod = 'ddl', }) =>` |
| 24 | `hasErrors` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() => validati` |
| 28 | `hasWarnings` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() => validati` |
| 32 | `wasAutoFixed` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

#### `src/dialogs/common/select-tables/constants.ts`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `MAX_TABLES_IN_DIAGRAM`, `MAX_TABLES_WITHOUT_SHOWING_FILTER`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/dialogs/common/select-tables/select-tables.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `SelectTables`, `SelectTablesProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 32 | `onImport` | method | Event handler เชื่อม user/system event กับ state action | `({ selectedTables, databaseMetadata, }: { selectedTables?: SelectedTable[]; databaseMetadata?: DatabaseMetadata; }) => Promise<void>` |
| 39 | `onBack` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |
| 53 | `SelectTables` | component | React component แสดง UI และประสาน props/context/event | `({ databaseMetadata, onImport, onBack, isLoading = false, }) =>` |
| 67 | `allTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 114 | `tableCount` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => allTable` |
| 118 | `viewCount` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => allTable` |
| 125 | `tables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 133 | `filteredTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 158 | `totalPages` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => Math.max` |
| 163 | `paginatedTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 170 | `visibleSelectedTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 174 | `canAddMore` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() => selected` |
| 178 | `hasSearchResults` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() => filtered` |
| 182 | `allVisibleSelected` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 188 | `canSelectAllFiltered` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 201 | `handleTableToggle` | function | Event handler เชื่อม user/system event กับ state action | `(tableKey: string) => {` |
| 216 | `handleTogglePageSelection` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 235 | `handleSelectAllFiltered` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 246 | `handleNextPage` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 252 | `handlePrevPage` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 258 | `handleClearSelection` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 262 | `handleConfirm` | function | Event handler เชื่อม user/system event กับ state action | `async () =>` |
| 270 | `selectedTableObjects` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(t): t is SelectedTable =>` |
| 274 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 296 | `renderPagination` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() => (` |

### `src/dialogs/create-diagram-dialog`

#### `src/dialogs/create-diagram-dialog/create-diagram-dialog-step.ts`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `CreateDiagramDialogStep`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/dialogs/create-diagram-dialog/create-diagram-dialog.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `CreateDiagramDialog`, `CreateDiagramDialogProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 33 | `CreateDiagramDialog` | component | React component แสดง UI และประสาน props/context/event | `({ dialog, }) =>` |
| 63 | `fetchDiagrams` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async () =>` |
| 81 | `importNewDiagram` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `async ({ selectedTables, databaseMetadata, }: { selectedTables?: SelectedTable[]; databaseMetadata?: DatabaseMetadata; } = {}) => {` |
| 151 | `createEmptyDiagram` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async () =>` |
| 178 | `importNewDiagramOrFilterTables` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `async () =>` |

#### `src/dialogs/create-diagram-dialog/select-database/database-option.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `DatabaseOption`, `DatabaseOptionProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 11 | `DatabaseOption` | component | React component แสดง UI และประสาน props/context/event | `({ type }) =>` |
| 13 | `logo` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => getDatab` |

#### `src/dialogs/create-diagram-dialog/select-database/example-option.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `ExampleOption`, `ExampleOptionProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 8 | `ExampleOption` | component | React component แสดง UI และประสาน props/context/event | `() =>` |

#### `src/dialogs/create-diagram-dialog/select-database/select-database-content.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `SelectDatabaseContent`, `SelectDatabaseContentProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 17 | `onContinue` | method | Event handler เชื่อม user/system event กับ state action | `(selectedDatabaseType: DatabaseType) => void` |
| 38 | `SelectDatabaseContent` | component | React component แสดง UI และประสาน props/context/event | `({ databaseType, setDatabaseType, onContinue, }) =>` |
| 53 | `currentDatabasesTypes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 62 | `hasNextRow` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() => (current` |
| 67 | `hasPreviousRow` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 69 | `toggleRow` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |
| 77 | `handleTabChange` | function | Event handler เชื่อม user/system event กับ state action | `(value: string) =>` |
| 82 | `renderDatabaseGrid` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() => (` |

#### `src/dialogs/create-diagram-dialog/select-database/select-database.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `SelectDatabase`, `SelectDatabaseProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 17 | `onContinue` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |
| 21 | `createNewDiagram` | method | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `() => void` |
| 24 | `SelectDatabase` | component | React component แสดง UI และประสาน props/context/event | `({ onContinue, databaseType, setDatabaseType, hasExistingDiagram, createNewDiagram, }) =>` |

### `src/dialogs/create-relationship-dialog`

#### `src/dialogs/create-relationship-dialog/create-relationship-dialog.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `CreateRelationshipDialog`, `CreateRelationshipDialogProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 29 | `CreateRelationshipDialog` | component | React component แสดง UI และประสาน props/context/event | `({ dialog, sourceTableId: preSelectedSourceTableId }) =>` |
| 54 | `tableOptions` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 64 | `primaryFieldOptions` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 78 | `referencedFieldOptions` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 157 | `handleCreateRelationship` | function | Event handler เชื่อม user/system event กับ state action | `async () =>` |

### `src/dialogs/export-diagram-dialog`

#### `src/dialogs/export-diagram-dialog/export-diagram-dialog.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `ExportDiagramDialog`, `ExportDiagramDialogProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 25 | `ExportDiagramDialog` | component | React component แสดง UI และประสาน props/context/event | `({ dialog, }) =>` |
| 40 | `handleExport` | function | Event handler เชื่อม user/system event กับ state action | `async () =>` |
| 51 | `outputTypeOptions` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

### `src/dialogs/export-image-dialog`

#### `src/dialogs/export-image-dialog/export-image-dialog.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `ExportImageDialog`, `ExportImageDialogProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 34 | `ExportImageDialog` | component | React component แสดง UI และประสาน props/context/event | `({ dialog, format, }) =>` |
| 55 | `handleExport` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 63 | `scaleOptions` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

### `src/dialogs/export-sql-dialog`

#### `src/dialogs/export-sql-dialog/export-sql-dialog.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `ExportSQLDialog`, `ExportSQLDialogProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 41 | `ExportSQLDialog` | component | React component แสดง UI และประสาน props/context/event | `({ dialog, targetDatabaseType, }) =>` |
| 57 | `hasDeterministicPath` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 69 | `showExportModeToggle` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 77 | `exportSQLScript` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `async () =>` |
| 93 | `sourceTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === rel.sourceT` |
| 96 | `targetTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === rel.targetT` |
| 119 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === dep.tableId` |
| 122 | `dependentTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === dep.depende` |
| 179 | `fetchScript` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async () =>` |
| 196 | `renderError` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() => (` |
| 235 | `renderLoader` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() => (` |

### `src/dialogs/import-database-dialog`

#### `src/dialogs/import-database-dialog/import-database-dialog.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `ImportDatabaseDialog`, `ImportDatabaseDialogProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 27 | `ImportDatabaseDialog` | component | React component แสดง UI และประสาน props/context/event | `({ dialog, databaseType, importMethods = defaultImportMethods, initialImportMethod, }) =>` |
| 63 | `importDatabase` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `async () =>` |
| 104 | `rightmostTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(max, table) =>` |

### `src/dialogs/import-diagram-dialog`

#### `src/dialogs/import-diagram-dialog/import-diagram-dialog.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `ImportDiagramDialog`, `ImportDiagramDialogProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 25 | `ImportDiagramDialog` | component | React component แสดง UI และประสาน props/context/event | `({ dialog, }) =>` |
| 34 | `onFileChange` | function | Event handler เชื่อม user/system event กับ state action | `(files: File[]) =>` |
| 50 | `handleImport` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |

### `src/dialogs/open-diagram-dialog`

#### `src/dialogs/open-diagram-dialog/diagram-row-actions-menu/diagram-row-actions-menu.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `DiagramRowActionsMenu`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 19 | `onOpen` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |
| 20 | `refetch` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 24 | `DiagramRowActionsMenu` | component | React component แสดง UI และประสาน props/context/event | `({ diagram, onOpen, refetch, numberOfDiagrams, }) =>` |
| 34 | `onDelete` | function | Event handler เชื่อม user/system event กับ state action | `async () =>` |
| 43 | `onDuplicate` | function | Event handler เชื่อม user/system event กับ state action | `async () =>` |

#### `src/dialogs/open-diagram-dialog/open-diagram-dialog.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `OpenDiagramDialog`, `OpenDiagramDialogProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 36 | `OpenDiagramDialog` | component | React component แสดง UI และประสาน props/context/event | `({ dialog, canClose = true, }) =>` |
| 50 | `fetchDiagrams` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async () =>` |
| 67 | `openDiagram` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(diagramId: string) => {` |
| 77 | `handleRowKeyDown` | function | Event handler เชื่อม user/system event กับ state action | `(e: React.KeyboardEvent<HTMLTableRowElement>) => {` |
| 121 | `onFocusHandler` | function | Event handler เชื่อม user/system event กับ state action | `(diagramId: string) => setSelec` |

### `src/dialogs/star-us-dialog`

#### `src/dialogs/star-us-dialog/star-us-dialog.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `StarUsDialog`, `StarUsDialogProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 21 | `StarUsDialog` | component | React component แสดง UI และประสาน props/context/event | `({ dialog }) =>` |
| 30 | `handleConfirm` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |

### `src/dialogs/table-schema-dialog`

#### `src/dialogs/table-schema-dialog/table-schema-dialog.tsx`

บทบาท: dialog และ workflow ที่เกี่ยวข้อง. Exports: `TableSchemaDialog`, `TableSchemaDialogProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 35 | `onConfirm` | method | Event handler เชื่อม user/system event กับ state action | `({ schema }: { schema: DBSchema }) => void` |
| 39 | `TableSchemaDialog` | component | React component แสดง UI และประสาน props/context/event | `({ dialog, table, schemas, onConfirm, allowSchemaCreation = false, }) =>` |
| 53 | `allowSchemaSelection` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => schemas` |
| 58 | `defaultSchemaName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => defaultS` |
| 95 | `handleConfirm` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 105 | `schema` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(s) =>` |
| 112 | `schemaOptions` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 121 | `renderSwitchCreateOrSelectButton` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() => (` |

### `src/helmet/helmet-data.tsx`

#### `src/helmet/helmet-data.tsx`

บทบาท: bootstrap, configuration หรือ declaration. Exports: `HelmetData`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `HelmetData` | component | React component แสดง UI และประสาน props/context/event | `() =>` |

### `src/hooks/use-breakpoint.ts`

#### `src/hooks/use-breakpoint.ts`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useBreakpoint`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 22 | `useBreakpoint` | function | Hook อ่านหรือควบคุม Breakpoint; ดู implementation สำหรับ dependency และ side effect | `export function useBreakpoint<K extends BreakpointKey>(breakpointKey: K) {` |

### `src/hooks/use-canvas.ts`

#### `src/hooks/use-canvas.ts`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useCanvas`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `useCanvas` | function | Hook อ่านหรือควบคุม Canvas; ดู implementation สำหรับ dependency และ side effect | `() =>` |

### `src/hooks/use-chartdb.ts`

#### `src/hooks/use-chartdb.ts`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useChartDB`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `useChartDB` | function | Hook อ่านหรือควบคุม ChartDB; ดู implementation สำหรับ dependency และ side effect | `() =>` |

### `src/hooks/use-config.ts`

#### `src/hooks/use-config.ts`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useConfig`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `useConfig` | function | Hook อ่านหรือควบคุม Config; ดู implementation สำหรับ dependency และ side effect | `() =>` |

### `src/hooks/use-debounce-v2.ts`

#### `src/hooks/use-debounce-v2.ts`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useDebounce`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 7 | `cancel` | method | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() => void` |
| 21 | `useDebounce` | function | Hook อ่านหรือควบคุม Debounce; ดู implementation สำหรับ dependency และ side effect | `export function useDebounce<T extends (...args: any[]) => any>( callback: T, delay: number ): (...args: Parameters<T>) => void { // Use a ref to store the debounced function const debouncedFnRef = useRef<DebouncedFunc...` |
| 42 | `debouncedCallback` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(...args: Parameters<T>) =>` |

### `src/hooks/use-debounce.ts`

#### `src/hooks/use-debounce.ts`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useDebounce`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 6 | `useDebounce` | function | Hook อ่านหรือควบคุม Debounce; ดู implementation สำหรับ dependency และ side effect | `<T extends AnyFunction>( func: T, delay: number ): ((...args: Parameters<T>) => void) =>` |
| 12 | `debounce` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(...args: Parameters<T>) => {` |

### `src/hooks/use-dialog.ts`

#### `src/hooks/use-dialog.ts`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useDialog`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `useDialog` | function | Hook อ่านหรือควบคุม Dialog; ดู implementation สำหรับ dependency และ side effect | `() =>` |

### `src/hooks/use-export-diagram.tsx`

#### `src/hooks/use-export-diagram.tsx`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useExportDiagram`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 7 | `useExportDiagram` | function | Hook อ่านหรือควบคุม ExportDiagram; ดู implementation สำหรับ dependency และ side effect | `() =>` |
| 11 | `downloadOutput` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(name: string, dataUrl: string) =>` |
| 18 | `handleExport` | function | Event handler เชื่อม user/system event กับ state action | `async ({ diagram }: { diagram: Diagram }) => {` |

### `src/hooks/use-export-image.ts`

#### `src/hooks/use-export-image.ts`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useExportImage`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `useExportImage` | function | Hook อ่านหรือควบคุม ExportImage; ดู implementation สำหรับ dependency และ side effect | `() =>` |

### `src/hooks/use-focus-on.ts`

#### `src/hooks/use-focus-on.ts`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useFocusOn`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 10 | `useFocusOn` | function | Hook อ่านหรือควบคุม FocusOn; ดู implementation สำหรับ dependency และ side effect | `() =>` |
| 15 | `focusOnArea` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(areaId: string, options: FocusOptions = {}) => {` |
| 53 | `focusOnTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(tableId: string, options: FocusOptions = {}) => {` |
| 91 | `focusOnNote` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(noteId: string, options: FocusOptions = {}) => {` |
| 129 | `focusOnRelationship` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( relationshipId: string, sourceTableId: string, targetTableId: string, options: FocusOptions = {} ) => {` |

### `src/hooks/use-full-screen-spinner.ts`

#### `src/hooks/use-full-screen-spinner.ts`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useFullScreenLoader`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `useFullScreenLoader` | function | Hook อ่านหรือควบคุม FullScreenLoader; ดู implementation สำหรับ dependency และ side effect | `() =>` |

### `src/hooks/use-history.ts`

#### `src/hooks/use-history.ts`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useHistory`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `useHistory` | function | Hook อ่านหรือควบคุม History; ดู implementation สำหรับ dependency และ side effect | `() =>` |

### `src/hooks/use-layout.ts`

#### `src/hooks/use-layout.ts`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useLayout`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `useLayout` | function | Hook อ่านหรือควบคุม Layout; ดู implementation สำหรับ dependency และ side effect | `() =>` |

### `src/hooks/use-local-config.ts`

#### `src/hooks/use-local-config.ts`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useLocalConfig`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `useLocalConfig` | function | Hook อ่านหรือควบคุม LocalConfig; ดู implementation สำหรับ dependency และ side effect | `() =>` |

### `src/hooks/use-mobile.tsx`

#### `src/hooks/use-mobile.tsx`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useIsMobile`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 5 | `useIsMobile` | function | Hook อ่านหรือควบคุม IsMobile; ดู implementation สำหรับ dependency และ side effect | `export function useIsMobile() {` |
| 14 | `onChange` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |

### `src/hooks/use-redo-undo-stack.ts`

#### `src/hooks/use-redo-undo-stack.ts`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useRedoUndoStack`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `useRedoUndoStack` | function | Hook อ่านหรือควบคุม RedoUndoStack; ดู implementation สำหรับ dependency และ side effect | `() =>` |

### `src/hooks/use-storage.ts`

#### `src/hooks/use-storage.ts`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useStorage`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `useStorage` | function | Hook อ่านหรือควบคุม Storage; ดู implementation สำหรับ dependency และ side effect | `() =>` |

### `src/hooks/use-theme.ts`

#### `src/hooks/use-theme.ts`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useTheme`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `useTheme` | function | Hook อ่านหรือควบคุม Theme; ดู implementation สำหรับ dependency และ side effect | `() =>` |

### `src/hooks/use-update-table-field.ts`

#### `src/hooks/use-update-table-field.ts`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useUpdateTableField`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 19 | `generateFieldRegexPatterns` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `( dataType: DataTypeData, databaseType: DatabaseType ): { regex?: string; extractRegex?: RegExp; } =>` |
| 74 | `useUpdateTableField` | function | Hook อ่านหรือควบคุม UpdateTableField; ดู implementation สำหรับ dependency และ side effect | `( table: DBTable, field: DBField, customUpdateField?: (attrs: Partial<DBField>) => void ) =>` |
| 121 | `updateField` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |
| 134 | `primaryKeyFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 138 | `primaryKeyCount` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => primaryK` |
| 144 | `dataFieldOptions` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 145 | `standardTypes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(type) =>` |
| 167 | `customTypeOptions` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(type) => ({` |
| 181 | `handleDataTypeChange` | function | Event handler เชื่อม user/system event กับ state action | `(value, regexMatches) => {` |
| 275 | `debouncedNameUpdate` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(value: string) => {` |
| 288 | `debouncedNullableUpdate` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(value: boolean) => {` |
| 306 | `debouncedPrimaryKeyUpdate` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(value: boolean, primaryKeyCount: number) => {` |
| 333 | `handlePrimaryKeyToggle` | function | Event handler เชื่อม user/system event กับ state action | `(value: boolean) => {` |
| 346 | `handleNullableToggle` | function | Event handler เชื่อม user/system event กับ state action | `(value: boolean) => {` |
| 355 | `handleNameChange` | function | Event handler เชื่อม user/system event กับ state action | `(value: string) => {` |
| 364 | `generateFieldSuffix` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(typeId?: string) => {` |
| 381 | `removeField` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |

### `src/hooks/use-update-table.ts`

#### `src/hooks/use-update-table.ts`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useUpdateTable`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 7 | `useUpdateTable` | function | Hook อ่านหรือควบคุม UpdateTable; ดู implementation สำหรับ dependency และ side effect | `(table: DBTable) =>` |
| 12 | `debouncedUpdate` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(value: string) => {` |
| 25 | `handleTableNameChange` | function | Event handler เชื่อม user/system event กับ state action | `(value: string) => {` |

### `src/i18n/i18n.ts`

#### `src/i18n/i18n.ts`

บทบาท: bootstrap, configuration หรือ declaration. Exports: `languages`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

### `src/i18n/locales`

#### `src/i18n/locales/ar.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `ar`, `arMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/bn.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `bn`, `bnMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/de.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `de`, `deMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/en.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `en`, `enMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/es.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `es`, `esMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/fr.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `fr`, `frMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/gu.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `gu`, `guMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/hi.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `hi`, `hiMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/hr.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `hr`, `hrMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/id_ID.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `id_ID`, `id_IDMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/ja.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `ja`, `jaMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/ko_KR.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `ko_KR`, `ko_KRMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/mr.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `mr`, `mrMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/ne.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `ne`, `neMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/pt_BR.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `pt_BR`, `pt_BRMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/ru.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `ru`, `ruMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/te.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `te`, `teMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/tr.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `tr`, `trMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/uk.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `uk`, `ukMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/vi.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `vi`, `viMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/zh_CN.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `zh_CN`, `zh_CNMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/i18n/locales/zh_TW.ts`

บทบาท: ข้อความแปลสำหรับ locale. Exports: `zh_TW`, `zh_TWMetadata`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

### `src/i18n/types.ts`

#### `src/i18n/types.ts`

บทบาท: bootstrap, configuration หรือ declaration. Exports: `LanguageMetadata`, `LanguageTranslation`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

### `src/lib/check-constraints`

#### `src/lib/check-constraints/__tests__/check-constraints-validator.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/check-constraints/check-constraints-validator.ts`

บทบาท: utility และ business logic. Exports: `CheckConstraintValidationResult`, `validateCheckConstraint`, `validateCheckConstraintWithDetails`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 97 | `tokenize` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function tokenize(expression: string): Token[] { const tokens: Token[] = []; let i = 0; wh` |
| 305 | `validateCheckConstraint` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `export function validateCheckConstraint(expression: string): boolean { return validateCheckConstraintWithDetails(expression).isValid; }` |
| 315 | `validateCheckConstraintWithDetails` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `export function validateCheckConstraintWithDetails( expression: string ): CheckConstraintValidationResult { // Empty or whitespace-only expressions are invalid if (!expression \|\| !expression.trim()) { return { isVal...` |
| 377 | `validateTokenSequence` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `function validateTokenSequence( tokens: Token[] ): CheckConstraintValidationResult { if (tokens.length === 0) { return { isValid: false, error: 'Expression cannot be empty' }; } // Track contex` |

### `src/lib/clone.ts`

#### `src/lib/clone.ts`

บทบาท: utility และ business logic. Exports: `cloneDiagram`, `cloneTable`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 12 | `generateIdsMapFromTable` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `( table: DBTable, generateId: () => string = defaultGenerateId ): Map<string, string> =>` |
| 30 | `generateIdsMapFromDiagram` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `( diagram: Diagram, generateId: () => string = defaultGenerateId ): Map<string, string> =>` |
| 64 | `cloneTable` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `( table: DBTable, options: { generateId: () => string; idsMap: Map<string, string>; } = { generateId: defaultGenerateId, idsMap: new Map<string, string>(), } ): DBTable =>` |
| 67 | `generateId` | method | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `() => string` |
| 81 | `getNewId` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(id: string): string \| null =>` |
| 133 | `cloneDiagram` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `( diagram: Diagram, options: { generateId: () => string; } = { generateId: defaultGenerateId, } ): { diagram: Diagram; idsMap: Map<string, string> } =>` |
| 136 | `generateId` | method | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `() => string` |
| 146 | `getNewId` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(id: string): string \| null =>` |

### `src/lib/colors.ts`

#### `src/lib/colors.ts`

บทบาท: utility และ business logic. Exports: `colorOptions`, `defaultAreaColor`, `defaultTableColor`, `materializedViewColor`, `randomColor`, `viewColor`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 16 | `randomColor` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

### `src/lib/data`

#### `src/lib/data/data-types/clickhouse-data-types.ts`

บทบาท: catalog และ data transformation. Exports: `clickhouseDataTypes`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/data-types/data-types.ts`

บทบาท: catalog และ data transformation. Exports: `DataType`, `DataTypeData`, `FieldAttributeRange`, `areFieldTypesCompatible`, `autoIncrementAlwaysOn`, `dataTypeDataToDataType`, `dataTypeMap`, `dataTypeSchema`, `dataTypes`, `findDataTypeDataById`, `getDefaultPrimaryKeyType`, `getPreferredSynonym`, `requiresNotNull`, `sortDataTypes`, `sortedDataTypeMap`, `supportsArrayDataType`, `supportsAutoIncrementDataType`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 57 | `sortDataTypes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dataTypes: DataTypeData[]): DataTypeData[] =>` |
| 118 | `areFieldTypesCompatible` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export function areFieldTypesCompatible( type1: DataType, type2: DataType, databaseType: DatabaseType ): boolean {` |
| 136 | `dataTypeDataToDataType` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( dataTypeData: DataTypeData ): DataType =>` |
| 143 | `findDataTypeDataById` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( id: string, databaseType?: DatabaseType ): DataTypeData \| undefined =>` |
| 154 | `supportsAutoIncrementDataType` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `( dataTypeName: string ): boolean =>` |
| 173 | `autoIncrementAlwaysOn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dataTypeName: string): boolean =>` |
| 179 | `requiresNotNull` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(dataTypeName: string): boolean =>` |
| 191 | `supportsArrayDataType` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `( dataTypeName: string, databaseType: DatabaseType ): boolean =>` |
| 228 | `getPreferredSynonym` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( typeName: string, databaseType: DatabaseType ): DataTypeData \| null =>` |
| 267 | `getDefaultPrimaryKeyType` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( databaseType: DatabaseType ): DataType =>` |

#### `src/lib/data/data-types/generic-data-types.ts`

บทบาท: catalog และ data transformation. Exports: `genericDataTypes`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/data-types/mariadb-data-types.ts`

บทบาท: catalog และ data transformation. Exports: `mariadbDataTypes`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/data-types/mysql-data-types.ts`

บทบาท: catalog และ data transformation. Exports: `mysqlDataTypes`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/data-types/oracle-data-types.ts`

บทบาท: catalog และ data transformation. Exports: `oracleDataTypes`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/data-types/postgres-data-types.ts`

บทบาท: catalog และ data transformation. Exports: `getPostgresPreferredSynonym`, `postgresDataTypes`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 204 | `getPostgresPreferredSynonym` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( typeName: string ): DataTypeData \| null =>` |

#### `src/lib/data/data-types/sql-server-data-types.ts`

บทบาท: catalog และ data transformation. Exports: `sqlServerDataTypes`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/data-types/sqlite-data-types.ts`

บทบาท: catalog และ data transformation. Exports: `sqliteDataTypes`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/default-schemas.ts`

บทบาท: catalog และ data transformation. Exports: `defaultSchemas`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/import-metadata/__tests__/fix-metadata-json.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 381 | `consoleErrorSpy` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 401 | `consoleErrorSpy` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

#### `src/lib/data/import-metadata/filter-metadata.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `SelectedTable`, `filterMetadataByTables`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 10 | `filterMetadataByTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export function filterMetadataByTables({ metadata, selectedTables: inputSelectedTables, }: { metadata: DatabaseMetadata; selectedTables: SelectedTable[]; }): DatabaseMetadata {` |
| 17 | `selectedTables` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(st) =>` |
| 39 | `filteredTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) =>` |
| 55 | `filteredColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 56 | `fromTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(tb) => tb.schema ==` |
| 60 | `fromView` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(view) => view.schema` |
| 67 | `filteredPrimaryKeys` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(pk) =>` |
| 74 | `filteredIndexes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) =>` |
| 82 | `filteredForeignKeys` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(fk) =>` |
| 87 | `sourceIncluded` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(tb) => tb.schema ==` |
| 90 | `targetIncluded` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(tb) => tb.schema ==` |
| 103 | `typeUsedInColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |

#### `src/lib/data/import-metadata/import/custom-types.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `createCustomTypesFromMetadata`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 6 | `createCustomTypesFromMetadata` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `({ customTypes, }: { customTypes: DBCustomTypeInfo[]; }): DBCustomType[] =>` |

#### `src/lib/data/import-metadata/import/dependencies.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `createDependenciesFromMetadata`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 20 | `createDependenciesFromMetadata` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async ({ views, tables, databaseType, }: { views: ViewInfo[]; tables: DBTable[]; databaseType: DatabaseType; }): Promise<DBDependency[]> =>` |
| 36 | `dependencies` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dependency) =>` |
| 39 | `viewTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) =>` |
| 92 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) =>` |
| 136 | `filterDuplicateTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function filterDuplicateTables( tables: { schema?: string; tableName: string }[] ): { schema?: string; tableName: string }[] { const tableMap = new Map<string, { schema?: string;` |
| 154 | `preprocessViewDefinition` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function preprocessViewDefinition(viewDefinition: string): string { if (!viewDefinition) { return ''; } // Remove` |
| 209 | `preprocessViewDefinitionSQLServer` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function preprocessViewDefinitionSQLServer(viewDefinition: string): string { if (!viewDefinition) { return '';` |
| 272 | `preprocessViewDefinitionMySQL` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function preprocessViewDefinitionMySQL(viewDefinition: string): string { if (!viewDefinition) { return ''; } // Remove` |
| 289 | `removeRedundantParentheses` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `function removeRedundantParentheses(sql: string): string {` |
| 308 | `extractTablesFromAST` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function extractTablesFromAST( ast: AST \| AST[] ): { schema?: string; tableName: string }[] {` |
| 315 | `traverse` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function traverse(node: any) { if (!node \|\| visitedNodes.has(node)) return; visitedNo` |

#### `src/lib/data/import-metadata/import/fields.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `createFieldsFromMetadata`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 10 | `createFieldsFromMetadata` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `({ tableColumns, tablePrimaryKeys, aggregatedIndexes, databaseType, }: { tableColumns: ColumnInfo[]; tableSchema?: string; tableInfo: TableInfo; tablePrimaryKeys: PrimaryKeyInfo[]; aggregatedIndexes: AggregatedIndexIn...` |
| 23 | `uniqueColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(acc, col) =>` |
| 30 | `sortedColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a, b) => a.ordina` |
| 34 | `tablePrimaryKeysColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(pk) =>` |

#### `src/lib/data/import-metadata/import/index.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `loadFromDatabaseMetadata`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 14 | `loadFromDatabaseMetadata` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async ({ databaseType, databaseMetadata, diagramNumber, databaseEdition, }: { databaseType: DatabaseType; databaseMetadata: DatabaseMetadata; diagramNumber?: number; databaseEdition?: DatabaseEdition; }): Promise<Diag...` |
| 59 | `sortedTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a, b) =>` |

#### `src/lib/data/import-metadata/import/indexes.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `createIndexesFromMetadata`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 5 | `createIndexesFromMetadata` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `({ aggregatedIndexes, fields, }: { aggregatedIndexes: AggregatedIndexInfo[]; fields: DBField[]; }): DBIndex[] =>` |

#### `src/lib/data/import-metadata/import/relationships.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `createRelationshipsFromMetadata`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 11 | `determineCardinality` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( field: DBField, isTablePKComplex: boolean ): Cardinality =>` |
| 20 | `createRelationshipsFromMetadata` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `({ foreignKeys, tables, }: { foreignKeys: ForeignKeyInfo[]; tables: DBTable[]; }): DBRelationship[] =>` |
| 30 | `sourceTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) => table.name === f` |
| 38 | `targetTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) =>` |
| 43 | `sourceField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(field) => field.name === f` |
| 46 | `targetField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(field) => field.name === f` |

#### `src/lib/data/import-metadata/import/tables.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `createTablesFromMetadata`, `decodeViewDefinition`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 24 | `decodeViewDefinition` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( databaseType: DatabaseType, viewDefinition?: string ): string =>` |
| 42 | `createTablesFromMetadata` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `({ databaseMetadata, databaseType, }: { databaseMetadata: DatabaseMetadata; databaseType: DatabaseType; }): DBTable[] =>` |
| 137 | `result` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(tableInfo: TableInfo) =>` |
| 166 | `primaryKeyFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 175 | `matchingIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(index) =>` |

#### `src/lib/data/import-metadata/metadata-types/check-constraint-info.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `CheckConstraintInfo`, `CheckConstraintInfoSchema`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/import-metadata/metadata-types/column-info.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `ColumnInfo`, `ColumnInfoSchema`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/import-metadata/metadata-types/custom-type-info.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `DBCustomTypeFieldInfo`, `DBCustomTypeFieldInfoSchema`, `DBCustomTypeInfo`, `DBCustomTypeInfoSchema`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/import-metadata/metadata-types/database-metadata.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `DatabaseMetadata`, `DatabaseMetadataSchema`, `isDatabaseMetadata`, `loadDatabaseMetadata`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 43 | `isDatabaseMetadata` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(obj: unknown): boolean =>` |
| 54 | `loadDatabaseMetadata` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(jsonString: string): DatabaseMetadata =>` |

#### `src/lib/data/import-metadata/metadata-types/foreign-key-info.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `ForeignKeyInfo`, `ForeignKeyInfoSchema`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/import-metadata/metadata-types/index-info.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `AggregatedIndexInfo`, `IndexInfo`, `IndexInfoSchema`, `createAggregatedIndexes`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 34 | `createAggregatedIndexes` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `({ tableIndexes, }: { tableInfo: TableInfo; tableIndexes: IndexInfo[]; tableSchema?: string; }): AggregatedIndexInfo[] =>` |

#### `src/lib/data/import-metadata/metadata-types/primary-key-info.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `PrimaryKeyInfo`, `PrimaryKeyInfoSchema`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/import-metadata/metadata-types/table-info.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `TableInfo`, `TableInfoSchema`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/import-metadata/metadata-types/view-info.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `ViewInfo`, `ViewInfoSchema`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/import-metadata/scripts/clickhouse-script.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `clickhouseQuery`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/import-metadata/scripts/cockroachdb-script.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `cockroachdbQuery`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/import-metadata/scripts/maria-script.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `mariaDBQuery`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/import-metadata/scripts/mysql-script.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `getMySQLQuery`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 3 | `getMySQLQuery` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( options: { databaseEdition?: DatabaseEdition; } = {} ): string =>` |

#### `src/lib/data/import-metadata/scripts/oracle-script.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `oracleDBQuery`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/import-metadata/scripts/postgres-script.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `getPostgresQuery`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 7 | `getPostgresQuery` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( options: { databaseEdition?: DatabaseEdition; databaseClient?: DatabaseClient; } = {} ): string =>` |

#### `src/lib/data/import-metadata/scripts/scripts.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `ImportMetadataScripts`, `importMetadataScripts`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/import-metadata/scripts/sqlite-script.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `getSQLiteQuery`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 364 | `generateWranglerCommand` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(): string =>` |
| 387 | `getSQLiteQuery` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( options: { databaseEdition?: DatabaseEdition; databaseClient?: DatabaseClient; } = {} ): string =>` |

#### `src/lib/data/import-metadata/scripts/sqlserver-script.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `getSqlServerQuery`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 453 | `getSqlServerQuery` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( options: { databaseEdition?: DatabaseEdition; } = {} ): string =>` |

#### `src/lib/data/import-metadata/utils.ts`

บทบาท: แปลง metadata JSON เข้า Diagram. Exports: `fixMetadataJson`, `isStringMetadataJson`, `minimizeQuery`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 3 | `applyCommonFixups` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(json: string): string =>` |
| 22 | `extractMetadataWrapper` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(payload: string): string \| null =>` |
| 54 | `fixMetadataJson` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(metadataJson: string): string =>` |
| 160 | `isStringMetadataJson` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(metadataJsonString: string): boolean =>` |
| 173 | `minimizeQuery` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(query: string) =>` |

#### `src/lib/data/sql-export/__tests__/array-fields.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/sql-export/__tests__/cross-dialect-export.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 16 | `testId` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 19 | `createField` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(overrides: Partial<DBField>): DBField =>` |
| 31 | `createTable` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(overrides: Partial<DBTable>): DBTable =>` |
| 44 | `createDiagram` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(overrides: Partial<Diagram>): Diagram =>` |

#### `src/lib/data/sql-export/__tests__/export-sql-dbml.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 11 | `testId` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 15 | `createField` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(overrides: Partial<DBField>): DBField =>` |
| 28 | `createTable` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(overrides: Partial<DBTable>): DBTable =>` |
| 42 | `createDiagram` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(overrides: Partial<Diagram>): Diagram =>` |

#### `src/lib/data/sql-export/__tests__/export-sql-quoted-identifiers.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 11 | `testId` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 15 | `createField` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(overrides: Partial<DBField>): DBField =>` |
| 28 | `createTable` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(overrides: Partial<DBTable>): DBTable =>` |
| 42 | `createDiagram` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(overrides: Partial<Diagram>): Diagram =>` |

#### `src/lib/data/sql-export/__tests__/export-sql.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 14 | `testId` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 17 | `createField` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(overrides: Partial<DBField>): DBField =>` |
| 29 | `createTable` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(overrides: Partial<DBTable>): DBTable =>` |
| 42 | `createDiagram` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(overrides: Partial<Diagram>): Diagram =>` |
| 54 | `createTestDiagramWithPKIndex` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `( databaseType: DatabaseType ): { diagram: Diagram; fieldId: string } =>` |

#### `src/lib/data/sql-export/cross-dialect/common.ts`

บทบาท: สร้าง SQL จาก Diagram. Exports: `escapeSQLComment`, `exportFieldComment`, `formatMSSQLTableComment`, `formatTableComment`, `getInlineFK`, `isFunction`, `isKeyword`, `strHasQuotes`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 9 | `isFunction` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `export function isFunction(value: string): boolean {` |
| 25 | `isKeyword` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `export function isKeyword(value: string): boolean {` |
| 41 | `strHasQuotes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export function strHasQuotes(value: string): boolean {` |
| 45 | `exportFieldComment` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `export function exportFieldComment(comment: string): string {` |
| 56 | `escapeSQLComment` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export function escapeSQLComment(comment: string): string {` |
| 75 | `formatTableComment` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `export function formatTableComment(comment: string): string {` |
| 89 | `formatMSSQLTableComment` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `export function formatMSSQLTableComment(comment: string): string {` |
| 100 | `getInlineFK` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function getInlineFK(table: DBTable, diagram: Diagram): string {` |
| 108 | `targetTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === r.targe` |
| 111 | `sourceField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === r.sourc` |
| 114 | `targetField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === r.targe` |

#### `src/lib/data/sql-export/cross-dialect/index.ts`

บทบาท: สร้าง SQL จาก Diagram. Exports: `getSupportedTargetDialects`, `hasCrossDialectSupport`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 58 | `hasCrossDialectSupport` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `export function hasCrossDialectSupport( sourceDatabaseType: DatabaseType, targetDatabaseType: DatabaseType ): boolean { // Same database type doesn't need cross-dialect conversion if (sourceDatabaseType === targetData...` |
| 86 | `getSupportedTargetDialects` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function getSupportedTargetDialects( sourceDatabaseType: DatabaseType ): DatabaseType[] { return CROSS_DIALECT_SUPPORT[sourceDatabaseType] ?? []; }` |

#### `src/lib/data/sql-export/cross-dialect/postgresql/to-mssql.ts`

บทบาท: สร้าง SQL จาก Diagram. Exports: `exportPostgreSQLToMSSQL`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 34 | `convertPostgresDefaultToMSSQL` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function convertPostgresDefaultToMSSQL(field: DBField): string { if (!field.default) { return ''; } const defaultV` |
| 135 | `findCustomType` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `function findCustomType( fieldTypeName: string, customTypes: DBCustomType[] ): DBCustomType \| undefined { const normalizedName = fieldTypeName.toLowerCase(); return custo` |
| 155 | `mapPostgresTypeToMSSQL` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function mapPostgresTypeToMSSQL( field: DBField, customTypes: DBCustomType[], isIndexed: boolean = false ): { typeName: string; inlineComment: string \| null; } { const originalType = field.type.name.toLowerCase(); le...` |
| 274 | `isIdentity` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `function isIdentity(field: DBField): boolean { // Check increment flag if (field.increm` |
| 301 | `getEnumValuesComment` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `function getEnumValuesComment( fieldTypeName: string, customTypes: DBCustomType[] ): string \| null { const enumType = customTypes.find((ct) => { c` |
| 305 | `enumType` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(ct) =>` |
| 323 | `exportPostgreSQLToMSSQL` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `export function exportPostgreSQLToMSSQL({ diagram, onlyRelationships = false, }: { diagram: Diagram; onlyRelationships?: boolean; }): string { if (!diagram.tables \|\| !diagram.relationships) { return '` |
| 381 | `primaryKeyFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.primaryKey` |
| 386 | `validCheckConstraints` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 412 | `fieldDefinitions` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(field: DBField, index: number, allFields: DBField[]) => {` |
| 495 | `validIndexes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a, b) =>` |
| 505 | `field` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === fieldId` |
| 609 | `sourceTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === r.sourceTab` |
| 612 | `targetTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === r.targetTab` |
| 625 | `sourceField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === r.sourceFie` |
| 628 | `targetField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === r.targetFie` |
| 679 | `fksBySchema` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(acc, fk) => {` |

#### `src/lib/data/sql-export/cross-dialect/postgresql/to-mysql.ts`

บทบาท: สร้าง SQL จาก Diagram. Exports: `exportPostgreSQLToMySQL`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 35 | `convertPostgresDefaultToMySQL` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function convertPostgresDefaultToMySQL(field: DBField): string { if (!field.default) { return ''; } const def` |
| 119 | `findCustomType` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `function findCustomType( fieldTypeName: string, customTypes: DBCustomType[] ): DBCustomType \| undefined { const normalizedName = fieldTypeName.toLowerCase(); return custo` |
| 136 | `mapPostgresTypeToMySQL` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function mapPostgresTypeToMySQL( field: DBField, customTypes: DBCustomType[] ): { typeName: string; inlineComment: string \| null; } { const originalType = field.type.name.toLowerCase(); let inlineComme` |
| 219 | `isAutoIncrement` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `function isAutoIncrement(field: DBField): boolean { // Check increment flag if (field.increment) {` |
| 246 | `getEnumValuesComment` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `function getEnumValuesComment( fieldTypeName: string, customTypes: DBCustomType[] ): string \| null { // Find matching enum type const enumType = custo` |
| 251 | `enumType` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(ct) =>` |
| 269 | `exportPostgreSQLToMySQL` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `export function exportPostgreSQLToMySQL({ diagram, onlyRelationships = false, }: { diagram: Diagram; onlyRelationships?: boolean; }): string { if (!diagram.tables \|\| !diagram.relationships) { ret` |
| 328 | `primaryKeyFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.primaryKey` |
| 333 | `validCheckConstraints` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 340 | `fieldDefinitions` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(field: DBField, index: number, allFields: DBField[]) => {` |
| 424 | `validIndexes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a, b) =>` |
| 434 | `field` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === fieldId` |
| 481 | `indexFieldsWithPrefix` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(name) =>` |
| 483 | `field` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => \`\\`${f?.name}\\`\` === name` |
| 544 | `sourceTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === r.sourceTab` |
| 547 | `targetTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === r.targetTab` |
| 560 | `sourceField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === r.sourceFie` |
| 563 | `targetField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === r.targetFie` |

#### `src/lib/data/sql-export/cross-dialect/postgresql/type-mappings.ts`

บทบาท: สร้าง SQL จาก Diagram. Exports: `getFallbackTypeMapping`, `getTypeMapping`, `postgresqlIndexTypeToMySQL`, `postgresqlIndexTypeToSQLServer`, `postgresqlToMySQL`, `postgresqlToSQLServer`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 540 | `getTypeMapping` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function getTypeMapping( postgresType: string, targetDialect: 'mysql' \| 'sqlserver' ): TypeMapping \| undefined { const normalizedType = postgresType.toLowerCase().trim(); // Che` |
| 561 | `getFallbackTypeMapping` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function getFallbackTypeMapping( targetDialect: 'mysql' \| 'sqlserver' ): TypeMapping { return targetDialect === 'mysql' ? { targe` |

#### `src/lib/data/sql-export/cross-dialect/types.ts`

บทบาท: สร้าง SQL จาก Diagram. Exports: `IndexTypeMapping`, `IndexTypeMappingTable`, `TypeMapping`, `TypeMappingTable`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/sql-export/cross-dialect/unsupported-features.ts`

บทบาท: สร้าง SQL จาก Diagram. Exports: `UnsupportedFeature`, `UnsupportedFeatureType`, `detectUnsupportedFeatures`, `formatWarningsHeader`, `getFieldInlineComment`, `getIndexInlineComment`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 38 | `detectUnsupportedFeatures` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function detectUnsupportedFeatures( diagram: Diagram, targetDialect: DatabaseType ): UnsupportedFeature[] { const features: UnsupportedFeature[] = []; const dialectKey = targetDiale` |
| 72 | `detectCustomTypeIssues` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `function detectCustomTypeIssues( customTypes: DBCustomType[], dialectKey: 'mysql' \| 'sqlserver' ): UnsupportedFeature[] { const features: UnsupportedFeature[] = []; for (const` |
| 115 | `detectFieldIssues` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `function detectFieldIssues( table: DBTable, dialectKey: 'mysql' \| 'sqlserver' ): UnsupportedFeature[] { const features: UnsupportedFeature[] = []; con` |
| 215 | `detectIndexIssues` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `function detectIndexIssues( table: DBTable, dialectKey: 'mysql' \| 'sqlserver' ): UnsupportedFeature[] { const features: UnsupportedFeature[]` |
| 252 | `formatWarningsHeader` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `export function formatWarningsHeader( features: UnsupportedFeature[], sourceDialect: string, targetDialect: string ): string { if (features.length === 0) { return \`-- ${sourceDialect} to ${target` |
| 287 | `groupFeaturesByType` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function groupFeaturesByType( features: UnsupportedFeature[] ): Record<string, UnsupportedFeature[]> { const grouped: Record<string, UnsupportedFeature[]> = {}` |
| 305 | `formatTypeLabel` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `function formatTypeLabel(type: UnsupportedFeatureType): string { switch (type) { case 'custom` |
| 329 | `getFieldInlineComment` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function getFieldInlineComment( field: DBField, dialectKey: 'mysql' \| 'sqlserver' ): string \| null { const typeName = field.type.name.toLowerCase(); // A` |
| 352 | `getIndexInlineComment` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function getIndexInlineComment( index: DBIndex, dialectKey: 'mysql' \| 'sqlserver' ): string \| null { const indexType = (index.type \|\| 'btree').toLower` |

#### `src/lib/data/sql-export/export-per-type/common.ts`

บทบาท: สร้าง SQL จาก Diagram. Exports: `escapeSQLComment`, `exportFieldComment`, `formatMSSQLTableComment`, `formatTableComment`, `getInlineFK`, `isFunction`, `isKeyword`, `strHasQuotes`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `isFunction` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `export function isFunction(value: string): boolean {` |
| 20 | `isKeyword` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `export function isKeyword(value: string): boolean {` |
| 36 | `strHasQuotes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export function strHasQuotes(value: string): boolean {` |
| 40 | `exportFieldComment` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `export function exportFieldComment(comment: string): string {` |
| 51 | `escapeSQLComment` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export function escapeSQLComment(comment: string): string {` |
| 70 | `formatTableComment` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `export function formatTableComment(comment: string): string {` |
| 84 | `formatMSSQLTableComment` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `export function formatMSSQLTableComment(comment: string): string {` |
| 95 | `getInlineFK` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function getInlineFK(table: DBTable, diagram: Diagram): string {` |
| 103 | `targetTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === r.targe` |
| 106 | `sourceField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === r.sourc` |
| 109 | `targetField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === r.targe` |

#### `src/lib/data/sql-export/export-per-type/mssql.ts`

บทบาท: สร้าง SQL จาก Diagram. Exports: `exportMSSQL`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 13 | `parseMSSQLDefault` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function parseMSSQLDefault(field: DBField): string {` |
| 76 | `exportMSSQL` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `export function exportMSSQL({ diagram, onlyRelationships = false, }: { diagram: Diagram; onlyRelationships?: boolean; }): string {` |
| 195 | `validChecks` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 208 | `validIndexes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a, b) =>` |
| 220 | `field` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === fieldId` |
| 262 | `sourceTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === r.sourceTab` |
| 265 | `targetTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === r.targetTab` |
| 278 | `sourceField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === r.sourceFie` |
| 281 | `targetField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === r.targetFie` |
| 332 | `fksBySchema` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(acc, fk) => {` |

#### `src/lib/data/sql-export/export-per-type/mysql.ts`

บทบาท: สร้าง SQL จาก Diagram. Exports: `exportMySQL`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 14 | `parseMySQLDefault` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function parseMySQLDefault(field: DBField): string {` |
| 72 | `mapMySQLType` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function mapMySQLType(typeName: string): string { typeName = typeName.toLowerCase(); // Map` |
| 173 | `exportMySQL` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `export function exportMySQL({ diagram, onlyRelationships = false, }: { diagram: Diagram; onlyRelationships?: boolean; }): string {` |
| 224 | `primaryKeyFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.primaryKey` |
| 323 | `validChecks` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 343 | `validIndexes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a, b) =>` |
| 348 | `field` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === fieldId` |
| 386 | `hasTextOrBlob` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(field) => {` |
| 403 | `field` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => \`\\`${f?.name}\\`\` === name` |
| 446 | `sourceTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === r.sourceTab` |
| 449 | `targetTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === r.targetTab` |
| 462 | `sourceField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === r.sourceFie` |
| 465 | `targetField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === r.targetFie` |

#### `src/lib/data/sql-export/export-per-type/postgresql.ts`

บทบาท: สร้าง SQL จาก Diagram. Exports: `exportPostgreSQL`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 18 | `buildIndexName` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `function buildIndexName(tableName: string, indexName: string): string { const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '_'); const safeIndexName = indexName.replace(/[^a-zA` |
| 31 | `parsePostgresDefault` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function parsePostgresDefault(field: DBField): string {` |
| 88 | `mapPostgresType` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function mapPostgresType(typeName: string, fieldName: string): string { typeName = typeName.toLowerCase(); fieldName =` |
| 112 | `exportCustomTypes` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `function exportCustomTypes(customTypes: DBCustomType[]): string {` |
| 120 | `sortedTypes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a, b) =>` |
| 163 | `exportPostgreSQL` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `export function exportPostgreSQL({ diagram, onlyRelationships = false, }: { diagram: Diagram; onlyRelationships?: boolean; }): string {` |
| 244 | `primaryKeyFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.primaryKey` |
| 354 | `validChecks` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 384 | `validIndexes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a, b) =>` |
| 389 | `field` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === fieldId` |
| 476 | `sourceTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === r.sourceTab` |
| 479 | `targetTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === r.targetTab` |
| 492 | `sourceField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === r.sourceFie` |
| 495 | `targetField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === r.targetFie` |
| 560 | `fksBySchema` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(acc, fk) => {` |

#### `src/lib/data/sql-export/export-per-type/sqlite.ts`

บทบาท: สร้าง SQL จาก Diagram. Exports: `exportSQLite`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 13 | `parseSQLiteDefault` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function parseSQLiteDefault(field: DBField): string {` |
| 71 | `mapSQLiteType` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function mapSQLiteType(typeName: string, isPrimaryKey: boolean): string { const originalType = typeName; typeName = typeName.toLowerCase` |
| 147 | `exportSQLite` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `export function exportSQLite({ diagram, onlyRelationships = false, }: { diagram: Diagram; onlyRelationships?: boolean; }): string {` |
| 206 | `primaryKeyFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.primaryKey` |
| 220 | `sourceTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === r.sourceTableId` |
| 223 | `targetTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === r.targetTableId` |
| 242 | `sourceField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === r.sourceFieldId` |
| 245 | `targetField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === r.targetFieldId` |
| 391 | `validChecks` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 411 | `validIndexes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a, b) =>` |
| 416 | `field` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === fieldId` |

#### `src/lib/data/sql-export/export-sql-cache.ts`

บทบาท: สร้าง SQL จาก Diagram. Exports: `generateCacheKey`, `getFromCache`, `setInCache`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `getFromCache` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(key: string): string \| null =>` |
| 13 | `setInCache` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(key: string, value: string): void =>` |
| 21 | `generateCacheKey` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async ( databaseType: DatabaseType, sqlScript: string ): Promise<string> =>` |

#### `src/lib/data/sql-export/export-sql-script.ts`

บทบาท: สร้าง SQL จาก Diagram. Exports: `exportBaseSQL`, `exportSQL`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 24 | `normalizeQuotedDefault` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `(value: string): string =>` |
| 43 | `formatDefaultValue` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `(value: string): string =>` |
| 93 | `simplifyDataType` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(typeName: string): string =>` |
| 100 | `getQuotedTableName` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( table: DBTable, isDBMLFlow: boolean = false ): string =>` |
| 105 | `isAlreadyQuoted` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(name: string) =>` |
| 114 | `quoteIfNeeded` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(name: string) =>` |
| 131 | `getQuotedFieldName` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( fieldName: string, isDBMLFlow: boolean = false ): string =>` |
| 136 | `isAlreadyQuoted` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(name: string) =>` |
| 154 | `exportBaseSQL` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `({ diagram, targetDatabaseType, isDBMLFlow = false, onlyRelationships = false, skipFKGeneration = false, }: { diagram: Diagram; targetDatabaseType: DatabaseType; isDBMLFlow?: boolean; onlyRelationships?: boolean; skip...` |
| 204 | `nonViewTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) =>` |
| 316 | `primaryKeyFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(field) => field.primar` |
| 330 | `customEnumType` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(ct) =>` |
| 351 | `customCompositeType` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(ct) =>` |
| 410 | `precisionAndScaleTypes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 417 | `isNumericType` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(t) =>` |
| 548 | `validCheckConstraints` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.expression` |
| 597 | `indexFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(field): field is NonNullable<typeof field> =>` |
| 653 | `sourceTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) => table.id === rel` |
| 656 | `targetTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) => table.id === rel` |
| 660 | `sourceTableField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(field) => field.id === rel` |
| 663 | `targetTableField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(field) => field.id === rel` |
| 723 | `validateConfiguration` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 743 | `exportSQL` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `async ( diagram: Diagram, databaseType: DatabaseType, options?: { stream: boolean; onResultStream: (text: string) => void; signal?: AbortSignal; } ): Promise<string> =>` |
| 748 | `onResultStream` | method | Event handler เชื่อม user/system event กับ state action | `(text: string) => void` |
| 840 | `getMySQLDataTypeSize` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `function getMySQLDataTypeSize(type: DataType) {` |
| 857 | `alignForeignKeyDataTypes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function alignForeignKeyDataTypes(diagram: Diagram) {` |
| 884 | `sourceField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(field: { id: string }) => field.id === sou` |
| 887 | `targetField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(field: { id: string }) => field.id === tar` |
| 907 | `generateSQLPrompt` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(databaseType: DatabaseType, sqlScript: string) =>` |

#### `src/lib/data/sql-import/__tests__/sql-import.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 34 | `fieldNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 40 | `idField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 44 | `nameField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 48 | `emailField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 81 | `playlistTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 86 | `playlistUserIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 91 | `usersTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 94 | `usersUserIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 139 | `playlistTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 144 | `playlistUserIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 149 | `usersTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 152 | `usersUserIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 195 | `playlistTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 200 | `playlistUserIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 205 | `usersTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 208 | `usersUserIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 251 | `playlistTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 256 | `playlistUserIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 261 | `usersTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 264 | `usersUserIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 307 | `playlistTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 312 | `playlistUserIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 317 | `usersTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 320 | `usersUserIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 374 | `fieldNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 386 | `pkField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 391 | `totalAmountField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 397 | `discountAmountField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 406 | `orderDateField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 410 | `customerIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 467 | `pkField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 475 | `numberField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 482 | `codeField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 489 | `referenceField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 497 | `grossAmountField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 506 | `taxRate1Field` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 514 | `issueDateField` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(f) =>` |
| 520 | `paymentDateField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 526 | `createdAtField` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(f) =>` |
| 533 | `updatedAtField` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(f) =>` |
| 539 | `fkStatusField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 546 | `fkUpdatedByField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 554 | `fkCreatedByField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |

#### `src/lib/data/sql-import/__tests__/sql-validator-autofix.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/sql-import/__tests__/sql-validator.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/sql-import/common.ts`

บทบาท: แปลงหรือ validate SQL เข้า Diagram. Exports: `SQLASTArg`, `SQLASTNode`, `SQLBinaryExpr`, `SQLBooleanNode`, `SQLCastNode`, `SQLCheckConstraint`, `SQLColumn`, `SQLColumnRef`, `SQLCustomType`, `SQLDefaultNode`, `SQLEnumType`, `SQLExprList`, `SQLForeignKey`, `SQLFunctionNode`, `SQLIndex`, `SQLNullNode`, `SQLNumberNode`, `SQLParserResult`, `SQLStringLiteral`, `SQLTable`, `buildSQLFromAST`, `convertToChartDBDiagram`, `determineCardinality`, `mapSQLTypeToGenericType`, `quoteIdentifier`, `typeAffinity`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 165 | `quoteIdentifier` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export function quoteIdentifier(str: string, dbType: DatabaseType): string { switch (dbType) { case DatabaseT` |
| 180 | `buildSQLFromAST` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `export function buildSQLFromAST( ast: SQLASTNode \| null \| undefined, dbType: DatabaseType = DatabaseType.GENERIC ): string {` |
| 317 | `determineCardinality` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function determineCardinality( isSourceUnique: boolean, isTargetUnique: boolean ): { sourceCardinality: Cardinality; targetCardinality: Cardinality } { if (isSourceUnique && isTargetUnique) {` |
| 345 | `mapSQLTypeToGenericType` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `export function mapSQLTypeToGenericType( sqlType: string, databaseType?: DatabaseType ): DataType { if (!sqlType) { return genericDataTypes.fin` |
| 374 | `foundType` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === typeMap` |
| 383 | `matchedType` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 415 | `foundType` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 622 | `convertToChartDBDiagram` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `export function convertToChartDBDiagram( parserResult: SQLParserResult, sourceDatabaseType: DatabaseType, targetDatabaseType: DatabaseType ): Diagram { // Create a mapping of old table IDs to new ones` |
| 631 | `tables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table, index) =>` |
| 639 | `fields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(column) =>` |
| 898 | `indexes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx): idx is DBIndex =>` |
| 900 | `fieldIds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(id): id is string =>` |
| 902 | `field` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 969 | `sourceTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === r` |
| 979 | `targetTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === r` |
| 1009 | `sourceField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name.toLow` |
| 1012 | `targetField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name.toLow` |

#### `src/lib/data/sql-import/dialect-importers/mysql/__tests__/mysql-core.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 20 | `idColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 41 | `idColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 46 | `field2Column` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'fiel` |

#### `src/lib/data/sql-import/dialect-importers/mysql/__tests__/mysql-default-values.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 16 | `statusColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'memb` |
| 33 | `incantationColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'inca` |
| 37 | `metadataColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'spel` |
| 56 | `monsterColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'mons` |
| 60 | `treasureColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'max_` |
| 77 | `priceColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'base` |
| 81 | `discountColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'loya` |
| 101 | `aliveColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'is_a` |
| 105 | `cursedColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'is_c` |
| 123 | `traitColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'spec` |
| 143 | `acceptedColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'ques` |
| 147 | `updatedColumn` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(c) => c.name === 'last` |
| 165 | `idColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'hero` |
| 176 | `consoleErrorSpy` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 203 | `rankColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 206 | `verifiedColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'is_g` |
| 211 | `goldColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'gold` |
| 216 | `balanceColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'acco` |
| 221 | `joinedColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'join` |
| 226 | `inventoryColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'inve` |

#### `src/lib/data/sql-import/dialect-importers/mysql/__tests__/mysql-views.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 276 | `tables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 277 | `views` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 286 | `views` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 302 | `tables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 472 | `orgsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 478 | `columnNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 486 | `idColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 491 | `nameColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 499 | `issuesTable` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(t) =>` |
| 505 | `columnNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 517 | `idColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 522 | `descColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 527 | `createdByColumn` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(c) => c.name === '` |
| 532 | `closedAtColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 541 | `activeOrgMembersView` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 549 | `columnNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 562 | `tables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 563 | `views` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |

#### `src/lib/data/sql-import/dialect-importers/mysql/mysql-common.ts`

บทบาท: แปลงหรือ validate SQL เข้า Diagram. Exports: `AlterTableConstraintDefinition`, `AlterTableExprItem`, `AlterTableStatement`, `ColumnDefinition`, `ColumnReference`, `ConstraintDefinition`, `CreateIndexStatement`, `CreateTableStatement`, `ReferenceDefinition`, `SQLAstNode`, `TableLike`, `TableReference`, `TypeArgs`, `extractColumnName`, `findTableWithSchemaSupport`, `getTableIdWithSchemaSupport`, `getTypeArgs`, `parserOpts`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 121 | `extractColumnName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export function extractColumnName( columnObj: string \| ColumnReference \| undefined ): string { if (!columnObj) return ''; // Handle different for` |
| 166 | `getTypeArgs` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function getTypeArgs( definition: ColumnDefinition['definition'] \| undefined ): TypeArgs { const typeArgs: TypeArgs = {}; if (!definition) return typ` |
| 186 | `findTableWithSchemaSupport` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function findTableWithSchemaSupport( tables: TableLike[], tableName: string, schemaName?: string ): TableLike \| undefined { // Default to public schema if none provided const effecti` |
| 195 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name =` |
| 215 | `getTableIdWithSchemaSupport` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function getTableIdWithSchemaSupport( tableMap: Record<string, string>, tableName: string, schemaName?: string ): string \| undefined { // Default to public schema if none provided co` |

#### `src/lib/data/sql-import/dialect-importers/mysql/mysql.ts`

บทบาท: แปลงหรือ validate SQL เข้า Diagram. Exports: `fromMySQL`, `isMySQLFormat`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 15 | `extractCheckConstraintsFromCreateTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function extractCheckConstraintsFromCreateTable( sql: string ): SQLCheckConstraint[] { const constraints: SQLCheckConstraint[] = []; // Extract` |
| 74 | `extractStatements` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function extractStatements(sqlContent: string): string[] { const statements: string[] = []; let current` |
| 109 | `extractColumnsFromView` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function extractColumnsFromView(sql: string): SQLColumn[] { const columns: SQLColumn[] = []; // First, try to extract explicit column list from CREATE VIEW viewname (col1, col2,` |
| 120 | `columnNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 202 | `extractColumnsFromCreateTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function extractColumnsFromCreateTable(statement: string): SQLColumn[] { const columns: SQLColumn[] = []; // Extract everything between` |
| 273 | `processCreateIndexStatement` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function processCreateIndexStatement( statement: string, tableMap: Record<string, string>, tables: SQLTable[] ): void { if ( !statement.startsWith('CREATE INDEX'` |
| 320 | `indexColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 341 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 347 | `existingIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) =>` |
| 370 | `detectInlineReferences` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `function detectInlineReferences(sqlContent: string): { found: boolean; line: number; } { const lines = sqlContent.split('\n'); for (let i = 0; i < lines.length; i++) { const line = lines[i].trim();` |
| 385 | `fromMySQL` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export async function fromMySQL(sqlContent: string): Promise<SQLParserResult> {` |
| 546 | `pkColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(colDef) =>` |
| 571 | `col` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 1034 | `sourceColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 1046 | `targetColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 1184 | `isMySQLFormat` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `export function isMySQLFormat(sqlContent: string): boolean {` |
| 1225 | `findForeignKeysUsingRegex` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `function findForeignKeysUsingRegex( sqlContent: string, tableMap: Record<string, string>, relationships: SQLForeignKey[], addedRelationships: Set<string> ): void {` |

#### `src/lib/data/sql-import/dialect-importers/oracle/__tests__/oracle-core.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 152 | `idColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 246 | `nameIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(i) => i.name === '` |
| 253 | `emailIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(i) => i.name === '` |
| 321 | `idColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 342 | `idColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 347 | `field2Column` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'fiel` |

#### `src/lib/data/sql-import/dialect-importers/oracle/__tests__/oracle-data-types.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 173 | `amountCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 183 | `percentCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 209 | `shortCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 218 | `longCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |

#### `src/lib/data/sql-import/dialect-importers/oracle/__tests__/oracle-examples.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 105 | `selfRefRel` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 216 | `customersTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 223 | `customerIdCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 229 | `catSelfRef` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 236 | `orderAddressRels` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.sourceTabl` |
| 309 | `transAccountRels` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 316 | `accountsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 319 | `transactionsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |

#### `src/lib/data/sql-import/dialect-importers/oracle/__tests__/oracle-full-flow.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 85 | `deptTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 86 | `empTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 207 | `productsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |

#### `src/lib/data/sql-import/dialect-importers/oracle/__tests__/oracle-relationships.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 26 | `deptTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 27 | `empTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 70 | `accountsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 73 | `transactionsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 161 | `poProductRel` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 171 | `productsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 174 | `poTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 185 | `epEmployeeRel` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 192 | `epManagerRel` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 203 | `relationshipsWithMissingIds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 260 | `userRel` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.targetTabl` |
| 263 | `productRel` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.targetTabl` |
| 295 | `table1` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 296 | `table2` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 301 | `table1IdCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 307 | `table2IdCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |

#### `src/lib/data/sql-import/dialect-importers/oracle/oracle-common.ts`

บทบาท: แปลงหรือ validate SQL เข้า Diagram. Exports: `AlterTableExprItem`, `AlterTableStatement`, `ColumnDefinition`, `ColumnReference`, `ConstraintDefinition`, `CreateIndexStatement`, `CreateTableStatement`, `TableReference`, `extractColumnName`, `findTableWithSchemaSupport`, `getTypeArgs`, `normalizeOracleIdentifier`, `parserOpts`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 98 | `extractColumnName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export function extractColumnName(columnRef: ColumnReference \| string): string { if (typeof columnRef === 'string') { // Re` |
| 114 | `getTypeArgs` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function getTypeArgs( definition?: ColumnDefinition['definition'] ): { length?: number; precision?: number; scale?: number } \| undefined { if (!definition) return undefined; const result: { length` |
| 144 | `findTableWithSchemaSupport` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function findTableWithSchemaSupport( tables: Array<{ id: string; name: string; schema?: string }>, tableName: string, schemaName?: string ): { id: string; name: string; schema?: string } \| undefined { // Norma...` |
| 163 | `exactMatch` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name.t` |
| 175 | `normalizeOracleIdentifier` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `export function normalizeOracleIdentifier(identifier: string): string { if (!identifier) return ''; // If quoted with double quote` |

#### `src/lib/data/sql-import/dialect-importers/oracle/oracle.ts`

บทบาท: แปลงหรือ validate SQL เข้า Diagram. Exports: `fromOracle`, `isOracleFormat`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 27 | `preprocessOracleScript` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function preprocessOracleScript(sqlContent: string): string { // 1. Remove Oracle-specific SET commands sqlContent = sqlContent.replace( /SE` |
| 145 | `statements` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(stmt) =>` |
| 150 | `filteredStatements` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(stmt) =>` |
| 166 | `parseAlterTableAddConstraint` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function parseAlterTableAddConstraint(statements: string[]): SQLForeignKey[] { const fkData: SQLForeignKey[] = []; // Oracle ALTER TABLE ... ADD CO` |
| 228 | `normalizeOracleDataType` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function normalizeOracleDataType(dataType: string): string { const lowerType = dataType.toLowerCase().trim(); s` |
| 310 | `parseCreateTableManually` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function parseCreateTableManually( statement: string, tables: SQLTable[], tableMap: Record<string, string>, relationships: SQLForeignKey[] ): void { // Extract table name and schema (handling quoted identifiers) const ta` |
| 409 | `pkColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 414 | `column` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name.toUpperCase() ===` |
| 443 | `pkColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 448 | `column` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 467 | `uniqueColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 566 | `args` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a) =>` |
| 611 | `fromOracle` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export async function fromOracle(sqlContent: string): Promise<SQLParserResult> { const tables: SQLTable[] = []; const relationships: SQLForeignKey[] = []; const tableMap: Record<string, string> = {}; // Maps table nam...` |
| 618 | `statements` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(stmt) =>` |
| 623 | `alterTableStatements` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(stmt) =>` |
| 635 | `createTableStatements` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(stmt) =>` |
| 655 | `stmts` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(stmt) =>` |
| 706 | `createIndexStatements` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(stmt) =>` |
| 733 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 742 | `columns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 747 | `existingIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(i) =>` |
| 787 | `processCreateIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function processCreateIndex( stmt: CreateIndexStatement, tables: SQLTable[] ): void { if (!stmt.table \|\| !stmt.columns \|\| stm` |
| 822 | `indexColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 833 | `tableObj` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 835 | `existingIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(i) => i.name.toUpp` |
| 851 | `processAlterTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function processAlterTable( stmt: AlterTableStatement, tables: SQLTable[], relationships: SQLForeignKey[] ): void { if (!stmt.table \|\| !stmt.expr \|\| !Array` |
| 942 | `existingRel` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 979 | `linkRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function linkRelationships( tables: SQLTable[], relationships: SQLForeignKey[], tableMap: Record<string, string> ): SQLForeignKey[] { // First, ensure all table keys are normalized const normalizedTableMap: Record<str...` |
| 1006 | `validRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(rel) =>` |
| 1052 | `isOracleFormat` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `export function isOracleFormat(sqlContent: string): boolean { const oracleMarkers = [ 'VARCHAR2', 'NUMBER(', 'SYSDATE', 'SYSTIMESTAMP', 'SYS_GUID', 'GENERATED ALWAYS AS ID` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/postgresql-alter-add-column.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 44 | `idColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 50 | `countryIdColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) => col.name ===` |
| 56 | `streetColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) => col.name ===` |
| 62 | `remarksColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) => col.name ===` |
| 86 | `emailColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) => col.name ===` |
| 92 | `createdAtColumn` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(col) => col.name ===` |
| 117 | `nameColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) => col.name ===` |
| 123 | `skuColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) => col.name ===` |
| 129 | `priceColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) => col.name ===` |
| 155 | `nameColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) => col.name ===` |
| 179 | `valueColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) => col.name ===` |
| 203 | `myColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) => col.name ===` |
| 209 | `anotherColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) => col.name ===` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/postgresql-alter-column-type.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 31 | `field1` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 35 | `field2` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 39 | `field3` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 67 | `nameCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 70 | `ageCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 73 | `scoreCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 105 | `field1` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 110 | `field2` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 114 | `field3` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/postgresql-alter-foreign-keys.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 70 | `locationTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 80 | `locationRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.sourceTabl` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/postgresql-core.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 403 | `hasWizardSchoolFK` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(r) =>` |
| 411 | `hasApprenticeMentorFK` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(r) =>` |
| 457 | `fks` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.sourceTabl` |
| 526 | `usersTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t: DBTable) => t.name === 'user` |
| 531 | `idField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f: DBField) => f.name === 'id'` |
| 537 | `nameField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f: DBField) => f.name === 'name` |
| 543 | `emailField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f: DBField) => f.name === 'emai` |
| 571 | `idColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 594 | `idColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 599 | `field2Column` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'fiel` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/postgresql-default-values.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 16 | `statusColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'hero` |
| 34 | `incantationColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'inca` |
| 50 | `greetingColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'elvi` |
| 69 | `goldColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'gold` |
| 73 | `treasureColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'max_` |
| 90 | `priceColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'mark` |
| 94 | `powerColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'magi` |
| 115 | `cursedColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'is_c` |
| 119 | `destroyedColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'is_d` |
| 123 | `legendaryColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'is_l` |
| 127 | `identifiedColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'is_i` |
| 145 | `abilityColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'spec` |
| 164 | `questIdColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'ques` |
| 168 | `startedColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'ques` |
| 172 | `updatedColumn` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(c) => c.name === 'last` |
| 176 | `difficultyColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'diff` |
| 242 | `questTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'guil` |
| 248 | `activeColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'is_a` |
| 253 | `statusColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'ques` |
| 258 | `completedColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'is_c` |
| 282 | `classColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'clas` |
| 287 | `xpColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'expe` |
| 292 | `guildColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'is_g` |
| 297 | `joinedColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'join` |
| 316 | `damageColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'dama` |
| 320 | `manaColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'mana` |
| 337 | `propertiesColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'prop` |
| 341 | `modifiersColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'modi` |
| 357 | `runeColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'rune` |
| 376 | `spawnColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'spaw` |
| 382 | `minionColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'mini` |
| 388 | `bossColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'boss` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/postgresql-examples.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 281 | `tableNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/postgresql-integration.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/postgresql-parser.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/postgresql-quoted-identifiers.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 224 | `profilesTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'user` |
| 229 | `postsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/postgresql-regression.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 131 | `fksFromAnother` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.sourceTabl` |
| 224 | `idField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 225 | `userIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 226 | `customerIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 243 | `pkFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-activities-table-import.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 31 | `idCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 39 | `userIdCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 45 | `workflowIdCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 51 | `taskIdCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 57 | `actionCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 63 | `descriptionCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 69 | `createdAtCol` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(c) =>` |
| 76 | `isReadCol` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(c) =>` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-alter-table-foreign-keys.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 130 | `potionFK` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.sourceColu` |
| 137 | `ingredientFK` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.sourceColu` |
| 243 | `regionRealmFK` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.sourceTabl` |
| 246 | `cityRegionFK` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.sourceTabl` |
| 249 | `cityRealmFK` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.sourceTabl` |
| 289 | `hasAlterWarning` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(w) =>` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-array-type-conversion.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 25 | `intArrayCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 31 | `textArrayCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 36 | `varcharArrayCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 48 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 52 | `intArrayField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 58 | `textArrayField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 66 | `varcharArrayField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 74 | `jsonbField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 80 | `regularIntField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 99 | `matrixCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 125 | `ginIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) =>` |
| 129 | `btreeIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) => idx.name ===` |
| 135 | `hashIndex` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(idx) => idx.name ===` |
| 148 | `diagramTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 153 | `diagramGinIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) => idx.name ===` |
| 159 | `diagramBtreeIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) => idx.name ===` |
| 165 | `diagramHashIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) => idx.name ===` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-comment-before-table.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-comment-removal.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 53 | `brewingNoteCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-complete-database-import.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 193 | `questSampleRewards` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 200 | `qsrColumnNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-complex-enum-scenarios.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 69 | `wizardStatus` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) => e.name === '` |
| 80 | `itemRarity` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) =>` |
| 105 | `wizardTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 108 | `spellsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-dragon-bonds-junction-table.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 53 | `dragonBonds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-dragon-status-enum.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 29 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 32 | `statusColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 55 | `dragonStatus` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) => e.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-empty-table.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-enum-complete.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 59 | `foundEnumNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) =>` |
| 65 | `wizardRankEnum` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) => e.name === '` |
| 72 | `wizardsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 74 | `rankField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 79 | `spellbooksTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 84 | `frequencyField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 90 | `schoolField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-enum-type-diagram-conversion.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 39 | `spellbooksTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 45 | `rankField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 52 | `frequencyField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 58 | `schoolField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-enum-types.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 29 | `questStatus` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) => e.name === '` |
| 40 | `difficultyLevel` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) => e.name === '` |
| 50 | `questsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 53 | `statusColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 59 | `difficultyColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 77 | `quoteTest` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) =>` |
| 81 | `numberStatus` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) => e.name === '` |
| 99 | `spellStatus` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) => e.name === '` |
| 106 | `portalStatus` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) => e.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-enum-with-mixed-quotes.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 21 | `columnNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-enums-with-table-usage.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 39 | `questStatus` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) => e.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-extension-type.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-find-junction-table-in-file.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 148 | `questSampleRewards` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 159 | `columnNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 164 | `questSampleRewardsWarnings` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(w) =>` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-foreign-key-relationships.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-forth-example-external-file.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 58 | `planSampleSpells` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-invalid-multiline-string.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 44 | `tableNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-junction-table-parsing.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 202 | `junctionTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name.inclu` |
| 211 | `questSampleRewards` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-junction-table-with-comments.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 58 | `mageGrimoires` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 124 | `spellCategorization` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-marketplace-database-parsing.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 268 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 281 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-minimal-types.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 46 | `spellsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 50 | `ritualsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 55 | `castTimeColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-multiple-enum-parsing.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 47 | `questStatus` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) => e.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-parse-all-create-statements.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-quest-management-database.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 230 | `questStatus` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) => e.name === '` |
| 243 | `contractsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 247 | `statusColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-quest-status-enum-parsing.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 26 | `questStatus` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) => e.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-real-world-import-example.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 76 | `fk` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.sourceTabl` |
| 85 | `mageRank` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) =>` |
| 123 | `hasParseWarning` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(w) =>` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-schema-qualified-enums.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 22 | `wizardRank` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) =>` |
| 31 | `spellSchool` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) => e.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-simple-enums.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-spell-books-junction-table.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 33 | `bookSpells` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 41 | `spellBookIdColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 48 | `spellIdColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 95 | `artifactEnchantments` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 100 | `wizardGuilds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 105 | `potionIngredients` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-spell-plans-with-enums.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 61 | `planSampleSpells` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-split-decimal-import.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 41 | `financialTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 48 | `balanceColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 53 | `interestColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 59 | `marketTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-string-preservation.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 17 | `noteCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 34 | `urlCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-tables-with-missing-references.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-third-example-external-file.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 77 | `questStatusParser` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) => e.name === '` |
| 82 | `questStatusDiagram` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 88 | `questsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 90 | `statusField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'stat` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/test-twenty-table-parsing.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 209 | `missingTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(expected) => !parsedTable` |
| 215 | `questSampleRewards` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/__tests__/verify-enum-conversion.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 40 | `wizardRankType` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 53 | `spellElementType` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 61 | `spellbooksTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 67 | `rankField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 74 | `elementField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 139 | `spellFreq` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 144 | `questStatus` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 156 | `spellbooksTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 159 | `castFreqField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/postgresql-common.ts`

บทบาท: แปลงหรือ validate SQL เข้า Diagram. Exports: `AlterTableConstraintDefinition`, `AlterTableExprItem`, `AlterTableStatement`, `ColumnDefinition`, `ColumnReference`, `ConstraintDefinition`, `CreateIndexStatement`, `CreateTableStatement`, `ReferenceDefinition`, `SQLAstNode`, `TableLike`, `TableReference`, `TypeArgs`, `extractColumnName`, `findTableWithSchemaSupport`, `getTableIdWithSchemaSupport`, `getTypeArgs`, `parserOpts`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 150 | `extractColumnName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export function extractColumnName( columnObj: string \| ColumnReference \| undefined ): string { if (!columnObj) return ''; // Handle different for` |
| 194 | `getTypeArgs` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function getTypeArgs( definition: ColumnDefinition['definition'] \| undefined ): TypeArgs { const typeArgs: TypeArgs = {}; if (!definition) return typ` |
| 218 | `findTableWithSchemaSupport` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function findTableWithSchemaSupport( tables: TableLike[], tableName: string, schemaName?: string ): TableLike \| undefined { // Default to public schema if none provided const effecti` |
| 227 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name =` |
| 247 | `getTableIdWithSchemaSupport` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function getTableIdWithSchemaSupport( tableMap: Record<string, string>, tableName: string, schemaName?: string ): string \| undefined { // Default to public schema if none provided co` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/postgresql-dump.ts`

บทบาท: แปลงหรือ validate SQL เข้า Diagram. Exports: `fromPostgresDump`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 23 | `extractStatements` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function extractStatements(sqlContent: string): string[] { const statements: string[] = []; let current` |
| 55 | `processForeignKeyConstraint` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function processForeignKeyConstraint( statement: string, tableMap: Record<string, string>, relationships: SQLForeignKey[] ): void { // Only process statements that look like foreign` |
| 104 | `sourceColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 127 | `targetColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 216 | `extractColumnsFromCreateTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function extractColumnsFromCreateTable(statement: string): SQLColumn[] { const columns: SQLColumn[] = []; // Extract everything between` |
| 271 | `processPrimaryKeyConstraint` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function processPrimaryKeyConstraint( statement: string, tableMap: Record<string, string>, tables: SQLTable[] ): void { // Only process statements that look like primary` |
| 308 | `pkColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 324 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 331 | `column` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 339 | `existingPkIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) =>` |
| 365 | `processUniqueConstraint` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function processUniqueConstraint( statement: string, tableMap: Record<string, string>, tables: SQLTable[] ): void { // Only process statements that look like un` |
| 409 | `uniqueColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 425 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 432 | `column` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === uniqu` |
| 442 | `existingUniqueIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) =>` |
| 463 | `processCreateIndexStatement` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function processCreateIndexStatement( statement: string, tableMap: Record<string, string>, tables: SQLTable[] ): void { if ( !statement.startsWith('CREATE INDEX'` |
| 510 | `indexColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 531 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 537 | `existingIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) =>` |
| 557 | `fromPostgresDump` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export async function fromPostgresDump( sqlContent: string ): Promise<SQLParserResult> { const tables: SQLTable[] = []; const relationships: SQLForeignKey[] = [` |
| 799 | `validRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(rel) => rel.sourceTa` |

#### `src/lib/data/sql-import/dialect-importers/postgresql/postgresql.ts`

บทบาท: แปลงหรือ validate SQL เข้า Diagram. Exports: `fromPostgres`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 57 | `preprocessSQL` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function preprocessSQL(sqlContent: string): PreprocessResult { const warnings: string[] = []; const statements: ParsedStatement[] = [];` |
| 70 | `cleanedLines` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(line) =>` |
| 194 | `splitSQLStatements` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function splitSQLStatements(sql: string): string[] { const statements: string[] = []; let currentStatement = ''; let inString = false;` |
| 275 | `isSerialTypeName` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `function isSerialTypeName(typeName: string): boolean { return SERIAL_TYPES.has(typeName.toUppe` |
| 285 | `hasGeneratedIdentity` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `function hasGeneratedIdentity(sql: string, columnName: string): boolean { // Create a regex pattern to find the column definition // Match the column name (quoted or unquoted) followed by its definition until the next...` |
| 308 | `normalizePostgreSQLType` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function normalizePostgreSQLType( type: string, length?: number \| undefined ): string { const upperType = type.toUpperCase(); // Handle types with parameters (e.g., VARCHAR(255), NUMERIC(10,2)) const typeMatch = uppe...` |
| 436 | `extractColumnsFromSQL` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function extractColumnsFromSQL(sql: string): SQLColumn[] { const columns: SQLColumn[] = []; // Extract the table body (including` |
| 584 | `extractColumnsFromView` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function extractColumnsFromView(sql: string): SQLColumn[] { const columns: SQLColumn[] = []; // First, try to extract explicit column list from CREATE VIEW viewname (col1, col2,` |
| 595 | `columnNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 682 | `extractEnumFromSQL` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function extractEnumFromSQL(sql: string): SQLEnumType \| null { // Match CREATE TYPE name AS ENUM (values) // Support both` |
| 752 | `extractForeignKeysFromCreateTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function extractForeignKeysFromCreateTable( sql: string, tableName: string, tableSchema: string, tableId: string, tableMap: Record<string, string> ): SQLForeignKey[] { const relationships: SQLForeignKey[] = []; // Ext...` |
| 841 | `extractCheckConstraintsFromCreateTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function extractCheckConstraintsFromCreateTable( sql: string ): SQLCheckConstraint[] { const constraints: SQLCheckConstraint[] = []; // Extract the table body const tableBodyMatch = sql.match(/\(([\s\S]+)\)/);` |
| 884 | `fromPostgres` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export async function fromPostgres( sqlContent: string ): Promise<SQLParserResult & { warnings?: string[] }> { const tables: SQLTable[] = []; const relationships: SQLForeignKey[] = [];` |
| 1228 | `column` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 1448 | `column` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) => (col as SQLColumn).name === colu` |
| 1928 | `column` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) => col.name === columnName` |
| 1941 | `params` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(p) =>` |
| 2218 | `uniqueRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(rel, index) =>` |
| 2238 | `getDefaultValueString` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `function getDefaultValueString( columnDef: ColumnDefinition ): string \| undefined {` |

#### `src/lib/data/sql-import/dialect-importers/sqlite/__tests__/sqlite-import.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 38 | `usersTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 64 | `sqliteSequenceTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 85 | `productsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 111 | `userProductsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 147 | `userIdFK` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 163 | `productIdFK` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 194 | `idColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 215 | `idColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 220 | `field2Column` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'fiel` |

#### `src/lib/data/sql-import/dialect-importers/sqlite/sqlite-common.ts`

บทบาท: แปลงหรือ validate SQL เข้า Diagram. Exports: `AlterTableExprItem`, `AlterTableStatement`, `ColumnDefinition`, `ColumnReference`, `ConstraintDefinition`, `CreateIndexStatement`, `CreateTableStatement`, `TableReference`, `extractColumnName`, `findTableWithSchemaSupport`, `getTableIdWithSchemaSupport`, `getTypeArgs`, `isValidForeignKeyRelationship`, `parserOpts`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 115 | `extractColumnName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export function extractColumnName(column: ColumnReference): string { if (typeof column === 'string') { return column; }` |
| 134 | `getTypeArgs` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function getTypeArgs(dataType?: { dataType: string; length?: number \| number[]; }): { size: number; precision?: number \| undefined; scale?: number \| undefined; } { const result = { size: 0, precision: undefi...` |
| 170 | `findTableWithSchemaSupport` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function findTableWithSchemaSupport( tables: { id: string; name: string; schema?: string }[], tableName: string, schemaName?: string ): { id: string; name: string; schema?: string } \| undefined { return tables...` |
| 185 | `getTableIdWithSchemaSupport` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function getTableIdWithSchemaSupport( tableName: string, schemaName?: string ): string { return schemaName ? \`${schemaName}.${tabl` |
| 195 | `isValidForeignKeyRelationship` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `export function isValidForeignKeyRelationship( relationship: { sourceTable: string; sourceColumn: string; targetTable: string; targetColumn: string; }, tables: { id: string; name: string; schema?: string }[] ): boolea...` |
| 231 | `sourceTableExists` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name =` |

#### `src/lib/data/sql-import/dialect-importers/sqlite/sqlite.ts`

บทบาท: แปลงหรือ validate SQL เข้า Diagram. Exports: `fromSQLite`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 30 | `fromSQLite` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export async function fromSQLite(sqlContent: string): Promise<SQLParserResult> { const tables: SQLTable[] = []; c` |
| 68 | `validRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(rel) =>` |
| 122 | `validRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(rel) =>` |
| 139 | `addCheckConstraintsToTables` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `function addCheckConstraintsToTables( sqlContent: string, tables: SQLTable[] ): void { // Find all CREATE TABLE statements and extract check constraints con` |
| 153 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name.toLow` |
| 194 | `parseCreateTableStatements` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function parseCreateTableStatements(sqlContent: string): { name: string; columns: SQLColumn[]; }[] { const tables: { name: string; columns: SQLColumn[]; primaryKeyC` |
| 238 | `simpleColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 294 | `pkCols` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 428 | `preprocessSQLiteDDL` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function preprocessSQLiteDDL(sqlContent: string): string { // Replace quoted identifiers with their unquoted equivalents let processedSQL = sqlContent` |
| 451 | `processCreateTableStatement` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function processCreateTableStatement( createTableStmt: CreateTableStatement, tables: SQLTable[], _: SQLForeignKey[], tableMap: Record<string, string> ): void { // Extract table name and schema let tableName = ''; let ...` |
| 658 | `processCreateIndexStatement` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function processCreateIndexStatement( createIndexStmt: CreateIndexStatement, tables: SQLTable[] ): void { if (!createIndexStmt.index \|\| !createIndexStmt.table) { retu` |
| 686 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name =` |
| 714 | `processAlterTableStatement` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function processAlterTableStatement( alterTableStmt: AlterTableStatement, tables: SQLTable[] ): void { if (!alterTableStmt.table \|\| !alterTableStmt.expr) { return; }` |
| 726 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name =` |
| 740 | `findForeignKeysUsingRegex` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `function findForeignKeysUsingRegex( sqlContent: string, tableMap: Record<string, string>, relationships: SQLForeignKey[] ): void { // Define patterns to find foreign keys const foreignKeyPatterns = [ //` |
| 887 | `validRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(rel) =>` |
| 913 | `addPlaceholderTablesForFKReferences` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `function addPlaceholderTablesForFKReferences( tables: SQLTable[], relationships: SQLForeignKey[], tableMap: Record<string, string> ): void { // Get all existing table names const existingTableNames = new Set(tables.ma...` |
| 949 | `columns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(colName) => ({` |

#### `src/lib/data/sql-import/dialect-importers/sqlserver/__tests__/sqlserver-core.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 243 | `idColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 338 | `authorIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(i) => i.name === '` |
| 344 | `titleIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(i) => i.name === '` |
| 366 | `idColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 387 | `idColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 392 | `field2Column` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'fiel` |

#### `src/lib/data/sql-import/dialect-importers/sqlserver/__tests__/sqlserver-default-values.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 16 | `allegianceColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'alle` |
| 33 | `runicColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'runi` |
| 37 | `prophecyColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'prop` |
| 59 | `goldColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'gold` |
| 63 | `capacityColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'max_` |
| 67 | `guardColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'guar` |
| 85 | `priceColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'weap` |
| 89 | `discountColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'guil` |
| 93 | `taxColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'ench` |
| 112 | `activeColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'is_a` |
| 116 | `breachedColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'is_b` |
| 136 | `startedColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'batt` |
| 140 | `actionColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'last` |
| 144 | `dateColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'batt` |
| 163 | `weaponColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'weap` |
| 167 | `legacyColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'lega` |
| 198 | `questDateColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'Ques` |
| 203 | `statusColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'Ques` |
| 208 | `rewardColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'Rewa` |
| 213 | `completedColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'IsCo` |
| 218 | `difficultyColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'Diff` |
| 223 | `guidColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'Ques` |
| 242 | `damageColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'base` |
| 246 | `powerColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'tota` |

#### `src/lib/data/sql-import/dialect-importers/sqlserver/__tests__/sqlserver-exact-user-case.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 29 | `spellDef` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 37 | `spellComp` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 48 | `fkDefToComp` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 58 | `selfRefFK` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |

#### `src/lib/data/sql-import/dialect-importers/sqlserver/__tests__/sqlserver-examples.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 276 | `tableNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 300 | `artifactsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'arti` |
| 431 | `crossSchemaRel` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.sourceTable ==` |
| 439 | `spellsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 447 | `itemsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'magi` |
| 470 | `itemTypesTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'item` |

#### `src/lib/data/sql-import/dialect-importers/sqlserver/__tests__/sqlserver-fantasy-database.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 396 | `spellTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 416 | `incantationField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'Inca` |
| 423 | `runicField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'Runi` |
| 431 | `magicSchoolTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 436 | `idColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === 'Id'` |
| 444 | `wizardTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 488 | `primaryRel` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 497 | `secondaryRel` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 566 | `decimalColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 603 | `magicalEnergyColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 637 | `idColumn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |

#### `src/lib/data/sql-import/dialect-importers/sqlserver/__tests__/sqlserver-full-flow.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 40 | `fk1` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 51 | `fk2` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |

#### `src/lib/data/sql-import/dialect-importers/sqlserver/__tests__/sqlserver-multi-schema.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 413 | `foundRelationshipNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 414 | `missingRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(name) => !foundRelati` |
| 425 | `crossSchemaRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.sourceSche` |
| 432 | `schoolsToCities` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 442 | `studentsToKingdoms` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 452 | `warriorsToGuilds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 462 | `merchantsToAccounts` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 473 | `validRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.sourceTabl` |
| 480 | `sourceTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 484 | `targetTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 496 | `withinSchemaRels` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.sourceSche` |
| 502 | `citiesToKingdoms` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 547 | `table1` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 548 | `table2` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 549 | `table3` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |

#### `src/lib/data/sql-import/dialect-importers/sqlserver/__tests__/sqlserver-multi-table-fk.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 32 | `questReward` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 38 | `questRelation` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 49 | `fkToRelation` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 59 | `selfRefFK` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 91 | `dragon` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 94 | `dragonLair` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 124 | `wizardDef` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 128 | `wizardRel` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |

#### `src/lib/data/sql-import/dialect-importers/sqlserver/__tests__/sqlserver-relationships.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 26 | `schoolsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 27 | `wizardsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 70 | `accountsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 73 | `purchasesTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 172 | `spellCastingRel` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 182 | `spellTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 185 | `spellCastingProcessTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 199 | `apprenticeWizardRel` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 206 | `apprenticeMentorRel` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 217 | `relationshipsWithMissingIds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |

#### `src/lib/data/sql-import/dialect-importers/sqlserver/__tests__/sqlserver-single-schema.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 613 | `validRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.sourceTabl` |
| 619 | `tableNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 630 | `characterToClass` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.name === '` |
| 639 | `guildsToCity` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.name === '` |
| 646 | `inventoryToItems` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.name === '` |
| 654 | `questPrerequisite` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.name === '` |
| 663 | `sourceTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 667 | `targetTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |

#### `src/lib/data/sql-import/dialect-importers/sqlserver/__tests__/sqlserver-varchar-max.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 26 | `descriptionCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 33 | `contentCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 39 | `titleCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 44 | `shortNoteCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 73 | `incantationField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 79 | `instructionsField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 86 | `spellNameField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 91 | `powerLevelField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 123 | `authorsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 126 | `bioCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 130 | `booksTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 133 | `summaryCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 138 | `fullTextCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 143 | `isbnCol` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(c) =>` |
| 174 | `commentsCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 178 | `reportCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 185 | `signatureCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 190 | `scoreCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.name === '` |
| 195 | `idCol` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |

#### `src/lib/data/sql-import/dialect-importers/sqlserver/__tests__/sqlserver-verify-fk.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 36 | `fk1` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 47 | `fk2` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |

#### `src/lib/data/sql-import/dialect-importers/sqlserver/__tests__/sqlserver-views.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 261 | `tables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 262 | `views` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 271 | `views` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 292 | `tables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 319 | `activeOrgMembersView` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 327 | `columnNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 344 | `projectsOrgFk` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |

#### `src/lib/data/sql-import/dialect-importers/sqlserver/sqlserver-common.ts`

บทบาท: แปลงหรือ validate SQL เข้า Diagram. Exports: `AlterTableExprItem`, `AlterTableStatement`, `ColumnDefinition`, `ColumnReference`, `ConstraintDefinition`, `CreateIndexStatement`, `CreateTableStatement`, `TableReference`, `extractColumnName`, `findTableWithSchemaSupport`, `getTableIdWithSchemaSupport`, `getTypeArgs`, `parserOpts`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 99 | `extractColumnName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export function extractColumnName(columnRef: ColumnReference \| string): string { if (typeof columnRef === 'string') { retur` |
| 114 | `getTypeArgs` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function getTypeArgs( definition?: ColumnDefinition['definition'] ): { length?: number; precision?: number; scale?: number } \| undefined { if (!definition) return undefined; const result: { length` |
| 144 | `findTableWithSchemaSupport` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function findTableWithSchemaSupport( tables: Array<{ id: string; name: string; schema?: string }>, tableName: string, schemaName?: string ): { id: string; name: string; schema?: string } \| undefined { // If sc...` |
| 157 | `exactMatch` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name =` |
| 169 | `getTableIdWithSchemaSupport` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function getTableIdWithSchemaSupport( tables: Array<{ id: string; name: string; schema?: string }>, tableMap: Record<string, string>, tableName: string, schemaName?: string ): string { const table = findTableWi...` |

#### `src/lib/data/sql-import/dialect-importers/sqlserver/sqlserver.ts`

บทบาท: แปลงหรือ validate SQL เข้า Diagram. Exports: `fromSQLServer`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 28 | `extractColumnsFromView` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function extractColumnsFromView(sql: string): SQLColumn[] { const columns: SQLColumn[] = []; // First, try to extract explicit column list from CREATE VIEW viewname (col1, col2,` |
| 39 | `columnNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 123 | `extractCheckConstraintsFromCreateTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function extractCheckConstraintsFromCreateTable( sql: string ): SQLCheckConstraint[] { const constraints: SQLCheckConstraint[] = []; // Extract` |
| 166 | `preprocessSQLServerScript` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function preprocessSQLServerScript(sqlContent: string): string { // 1. Remove USE statements sqlContent = sqlContent.replace(/USE\s+\[[^\]]+\]\s*;?/gi,` |
| 270 | `statements` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(stmt) =>` |
| 275 | `filteredStatements` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(stmt) =>` |
| 292 | `parseAlterTableAddConstraint` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function parseAlterTableAddConstraint(statements: string[]): SQLForeignKey[] { const fkData: SQLForeignKey[] = []; // Regular expressions to extract information from ALTER TABLE statements // Handle multi-line ALTER T...` |
| 356 | `normalizeSQLServerDataType` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function normalizeSQLServerDataType(dataType: string): string { // Convert to lowercase for consistent comparison const lowerType = dataType.toLowerCase().trim(); // Handle SQL S` |
| 434 | `parseCreateTableManually` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `function parseCreateTableManually( statement: string, tables: SQLTable[], tableMap: Record<string, string>, relationships: SQLForeignKey[] ): void { // Extract table name and schema (handling square brackets) const table` |
| 521 | `pkColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 529 | `column` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 557 | `pkColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 567 | `column` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 583 | `uniqueColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 775 | `fromSQLServer` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export async function fromSQLServer( sqlContent: string ): Promise<SQLParserResult> { const tables: SQLTable[] = []; const relationships: SQLForeignKey[] = []; const tableMap: Record<string, string> = {}; // Maps tabl...` |
| 785 | `statements` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(stmt) =>` |
| 815 | `alterTableStatements` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(stmt) =>` |
| 828 | `createTableStatements` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(stmt) =>` |
| 837 | `createViewStatements` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(stmt) =>` |
| 892 | `statements` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(stmt) =>` |
| 943 | `createIndexStatements` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(stmt) =>` |
| 962 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === tableName` |
| 966 | `columns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 1002 | `processCreateIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function processCreateIndex( stmt: CreateIndexStatement, tables: SQLTable[] ): void { if (!stmt.table \|\| !stmt.columns \|\| stm` |
| 1044 | `indexColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 1055 | `tableObj` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 1068 | `processAlterTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function processAlterTable( stmt: AlterTableStatement, tables: SQLTable[], relationships: SQLForeignKey[] ): void { if (!stmt.table \|\| !stmt.expr \|\| !Array` |
| 1190 | `linkRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function linkRelationships( tables: SQLTable[], relationships: SQLForeignKey[], tableMap: Record<string, string> ): SQLForeignKey[] { // First, ensure all table keys are normalized const normalizedTableMap: Record<str...` |
| 1218 | `validRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(rel) =>` |

#### `src/lib/data/sql-import/index.ts`

บทบาท: แปลงหรือ validate SQL เข้า Diagram. Exports: `detectDatabaseType`, `parseSQLError`, `sqlImportToDiagram`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 20 | `isPgDumpFormat` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `function isPgDumpFormat(sqlContent: string): boolean { // pg_dump output often contains specific markers const pgDumpMarkers = [ 'SET statement_timeout', 'SET lock_timeout', 'SET client_` |
| 55 | `isSQLServerFormat` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `function isSQLServerFormat(sqlContent: string): boolean { // SQL Server output often contains specific markers const sqlServerMarkers = [ 'SET ANSI_NULLS ON', 'SET QUOTED_IDENTIFIER ON', 'SET ANSI_PA` |
| 94 | `isSQLiteFormat` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `function isSQLiteFormat(sqlContent: string): boolean { // SQLite output often contains specific markers const sqliteMarkers = [ 'PRAGMA', 'INTEGER PRIMARY KEY AUTOINCREMENT', 'DEFAULT` |
| 121 | `detectDatabaseType` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function detectDatabaseType(sqlContent: string): DatabaseType \| null { // First check for PostgreSQL dump format if (isPgDumpFormat(sqlContent)) { return DatabaseType.POSTGRESQL; } // Check for SQL Server` |
| 176 | `sqlImportToDiagram` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export async function sqlImportToDiagram({ sqlContent, sourceDatabaseType, targetDatabaseType = DatabaseType.GENERIC, }: { sqlContent: string; sourceDatabaseType: DatabaseType; targetDatabaseType: DatabaseType; }): Pr...` |
| 241 | `sortedTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a, b) =>` |
| 267 | `parseSQLError` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `export async function parseSQLError({ sqlContent, sourceDatabaseType, }: { sqlContent: string; sourceDatabaseType: DatabaseType; }): Promise<{ success: boolean; error?: string; line?: number; column?: number; }> { try...` |

#### `src/lib/data/sql-import/sql-validator.ts`

บทบาท: แปลงหรือ validate SQL เข้า Diagram. Exports: `validateSQL`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 27 | `validateSQL` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `export function validateSQL( sql: string, databaseType: DatabaseType ): ValidationResult { switch (databaseType) { case DatabaseType.POSTGRESQL: case DatabaseType.COCKROACHDB: // CockroachDB uses PostgreSQL-compatible...` |

#### `src/lib/data/sql-import/validators/mysql-validator.ts`

บทบาท: แปลงหรือ validate SQL เข้า Diagram. Exports: `validateMySQLDialect`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 17 | `validateMySQLDialect` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `export function validateMySQLDialect(sql: string): ValidationResult { const errors: ValidationError[] = []; const warnings: ValidationWarning[] = []; // First check if the SQL is empty or just whitespace if` |

#### `src/lib/data/sql-import/validators/oracle-validator.ts`

บทบาท: แปลงหรือ validate SQL เข้า Diagram. Exports: `validateOracleDialect`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 17 | `validateOracleDialect` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `export function validateOracleDialect(sql: string): ValidationResult { const errors: ValidationError[] = []; const warnings: ValidationWarning[] = []; // First check if the SQL is empty or just whitespace if (!` |

#### `src/lib/data/sql-import/validators/postgresql-validator.ts`

บทบาท: แปลงหรือ validate SQL เข้า Diagram. Exports: `ValidationError`, `ValidationResult`, `ValidationWarning`, `formatValidationMessage`, `quickValidate`, `validatePostgreSQLDialect`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 33 | `validatePostgreSQLDialect` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `export function validatePostgreSQLDialect(sql: string): ValidationResult { const errors: ValidationError[] = []; const warnings: ValidationWarning[] = []; let fixedSQL = sql;` |
| 78 | `nonCommentLines` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(line) =>` |
| 257 | `formatValidationMessage` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `export function formatValidationMessage(result: ValidationResult): string { let message = ''; if (result.errors.length > 0)` |
| 264 | `syntaxErrors` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) =>` |
| 298 | `quickValidate` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export function quickValidate(sql: string): { hasErrors: boolean; errorCount: number; } { // Just check for the most common error (cast operato` |

#### `src/lib/data/sql-import/validators/sqlite-validator.ts`

บทบาท: แปลงหรือ validate SQL เข้า Diagram. Exports: `validateSQLiteDialect`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 17 | `validateSQLiteDialect` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `export function validateSQLiteDialect(sql: string): ValidationResult { const errors: ValidationError[] = []; const warnings: ValidationWarning[] = []; // First check if the SQL is empty or just whitespace if (!` |

#### `src/lib/data/sql-import/validators/sqlserver-validator.ts`

บทบาท: แปลงหรือ validate SQL เข้า Diagram. Exports: `validateSQLServerDialect`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 17 | `validateSQLServerDialect` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `export function validateSQLServerDialect(sql: string): ValidationResult { const errors: ValidationError[] = []; const warnings: ValidationWarning[] = []; // First check if the SQL is empty or just whitespace if (!sql ...` |

### `src/lib/databases.ts`

#### `src/lib/databases.ts`

บทบาท: utility และ business logic. Exports: `databaseDarkLogoMap`, `databaseLogoMap`, `databaseSecondaryLogoMap`, `databaseTypeToLabelMap`, `getDatabaseLogo`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 65 | `getDatabaseLogo` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( databaseType: DatabaseType, theme: EffectiveTheme ) =>` |

### `src/lib/dbml`

#### `src/lib/dbml/apply-dbml/__tests__/apply-dbml.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/dbml/apply-dbml/apply-dbml.ts`

บทบาท: นำเข้า ส่งออก หรือ apply DBML. Exports: `applyDBMLChanges`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 25 | `createObjectKey` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `({ type, schema, otherSchema, parentName, otherParentName, name, otherName, }: { type: \| 'table' \| 'field' \| 'index' \| 'relationship' \| 'customType' \| 'dependency' \| 'area'; schema?: string \| null; otherSchema...` |
| 51 | `createObjectKeyFromTable` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(table: DBTable) =>` |
| 58 | `createObjectKeyFromField` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(table: DBTable, field: DBField) =>` |
| 66 | `createObjectKeyFromIndex` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(table: DBTable, index: DBIndex) =>` |
| 74 | `createObjectKeyFromRelationship` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `( relationship: DBRelationship, sourceIdToNameMap: SourceIdToDataMap ) =>` |
| 98 | `createObjectKeyFromCustomType` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(customType: DBCustomType) =>` |
| 105 | `createObjectKeyFromDependency` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `( dependency: DBDependency, sourceIdToNameMap: SourceIdToDataMap ) =>` |
| 125 | `createObjectKeyFromArea` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(area: Area) =>` |
| 132 | `buildSourceMappings` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(sourceDiagram: Diagram) =>` |
| 199 | `updateTables` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `({ targetTables, sourceTables, defaultDatabaseSchema, }: { targetTables: DBTable[] \| undefined; sourceTables: DBTable[] \| undefined; objectKeysToIdsMap: Record<string, string>; sourceIdToDataMap: SourceIdToDataMap; ...` |
| 224 | `updatedTables` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(targetTable) =>` |
| 266 | `updatedFields` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(targetField) =>` |
| 289 | `updatedIndexes` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(targetIndex) =>` |
| 304 | `targetFieldIdsAsSourceIds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(fid) => idMappings.field` |
| 308 | `sourceIndexBySemantic` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(srcIndex) => {` |
| 327 | `fieldsMatch` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(fid, i) => fid === targetFieldIdsAs` |
| 364 | `targetField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === field.nam` |
| 387 | `updateCustomTypes` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `( customTypes: DBCustomType[] \| undefined, objectKeysToIdsMap: Record<string, string> ): DBCustomType[] =>` |
| 405 | `updateRelationships` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `( targetRelationships: DBRelationship[] \| undefined, sourceRelationships: DBRelationship[] \| undefined, idMappings: IdMappings ): DBRelationship[] =>` |
| 459 | `targetRel` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(tgtRel) =>` |
| 553 | `updateDependencies` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `( targetDependencies: DBDependency[] \| undefined, sourceDependencies: DBDependency[] \| undefined, idMappings: IdMappings ): DBDependency[] =>` |
| 563 | `sourceDep` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(srcDep) =>` |
| 598 | `updateIndexFieldReferences` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `( tables: DBTable[] \| undefined, idMappings: IdMappings ): DBTable[] =>` |
| 615 | `applyDBMLChanges` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `({ sourceDiagram, targetDiagram, }: { sourceDiagram: Diagram; targetDiagram: Diagram; }): Diagram =>` |
| 664 | `sortedRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a, b) =>` |
| 666 | `sourceRelA` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.id === a.i` |
| 669 | `sourceRelB` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.id === b.i` |

#### `src/lib/dbml/dbml-export/__tests__/composite-pk-export.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 79 | `masterUserIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 82 | `tenantIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 83 | `tenantUserIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |

#### `src/lib/dbml/dbml-export/__tests__/dbml-export-invalid-check-constraints.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/dbml/dbml-export/__tests__/dbml-export-issue-fix.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/dbml/dbml-export/__tests__/dbml-export-multiline-fix.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 11 | `testId` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 15 | `createField` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(overrides: Partial<DBField>): DBField =>` |
| 28 | `createTable` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(overrides: Partial<DBTable>): DBTable =>` |
| 42 | `createDiagram` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(overrides: Partial<Diagram>): Diagram =>` |

#### `src/lib/dbml/dbml-export/__tests__/dbml-export-sanitization.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/dbml/dbml-export/__tests__/dbml-self-referencing.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/dbml/dbml-export/__tests__/empty-tables.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/dbml/dbml-export/__tests__/export-sql-dbml-cases.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 7 | `testCase` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(caseNumber: string) =>` |

#### `src/lib/dbml/dbml-export/__tests__/timestamp-with-timezone.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 86 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 91 | `createdAtField` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(f) => f.name === '` |
| 94 | `updatedAtField` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(f) => f.name === '` |
| 172 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 175 | `startTimeField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 178 | `endTimeField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 241 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |
| 244 | `valueField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |

#### `src/lib/dbml/dbml-export/dbml-export.ts`

บทบาท: นำเข้า ส่งออก หรือ apply DBML. Exports: `DBMLExportResult`, `generateDBMLFromDiagram`, `sanitizeSQLforDBML`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 12 | `generateEnumsDBML` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(customTypes: DBCustomType[] \| undefined): string =>` |
| 39 | `databaseTypeToImportFormat` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( type: DatabaseType ): 'mysql' \| 'postgres' \| 'mssql' =>` |
| 59 | `fixProblematicFieldNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(diagram: Diagram): Diagram =>` |
| 88 | `relationTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'rela` |
| 96 | `fromField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'from` |
| 101 | `fixedRelationTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'relation` |
| 104 | `sourceField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'source'` |
| 113 | `toField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 116 | `fixedRelationTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'relation` |
| 119 | `targetField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'target'` |
| 139 | `sanitizeSQLforDBML` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(sql: string): string =>` |
| 193 | `processedLines` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(line) =>` |
| 221 | `columns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col: string) =>` |
| 283 | `findClosingBracket` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(str: string, openBracketIndex: number): number =>` |
| 318 | `convertToInlineRefs` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `(dbml: string): string =>` |
| 530 | `newLines` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(line) =>` |
| 568 | `sortedTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `([, a], [, b]) => a.start` |
| 624 | `finalLines` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(line) =>` |
| 639 | `deduplicateRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(diagram: Diagram): Diagram =>` |
| 644 | `uniqueRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(rel) =>` |
| 677 | `normalizeCharTypeFormat` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `(dbml: string): string =>` |
| 688 | `fixArrayTypes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dbml: string): string =>` |
| 695 | `fixTableBracketSyntax` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dbml: string): string =>` |
| 704 | `fixMultilineTableNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dbml: string): string =>` |
| 721 | `restoreIncrementAttribute` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dbml: string, tables: DBTable[]): string =>` |
| 728 | `incrementFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 770 | `restoreCheckConstraints` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dbml: string, tables: DBTable[]): string =>` |
| 777 | `validChecks` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 824 | `escapeDBMLComment` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(comment: string): string =>` |
| 838 | `restoreNotes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dbml: string, tables: DBTable[]): string =>` |
| 875 | `fieldsWithComments` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 925 | `restoreCompositePKNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dbml: string, tables: DBTable[]): string =>` |
| 932 | `pkIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) =>` |
| 934 | `primaryKeyFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 965 | `restoreIndexTypes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dbml: string, tables: DBTable[]): string =>` |
| 972 | `indexesWithType` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) => idx.type &&` |
| 985 | `fieldNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(name): name is string =>` |
| 987 | `field` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 1041 | `restoreIndexNotes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dbml: string, tables: DBTable[]): string =>` |
| 1048 | `indexesWithComments` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) => idx.comments` |
| 1061 | `fieldNames` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(name): name is string =>` |
| 1063 | `field` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 1116 | `restoreTableSchemas` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dbml: string, tables: DBTable[]): string =>` |
| 1194 | `tablesNeedingSchema` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ table }) =>` |
| 1239 | `extractRelationshipsDbml` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dbml: string): string =>` |
| 1241 | `refLines` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(line) =>` |
| 1252 | `generateRelationshipsDbmlFromDiagram` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `( relationships: DBRelationship[], tables: DBTable[] ): string =>` |
| 1364 | `generateDBMLFromDiagram` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `export function generateDBMLFromDiagram(diagram: Diagram): DBMLExportResult {` |
| 1368 | `validFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(field) => field.name !== '` |
| 1379 | `tablesWithFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) =>` |
| 1404 | `sourceTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === rel.sourceT` |
| 1407 | `targetTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === rel.targetT` |
| 1410 | `sourceFieldExists` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === rel.sourceF` |
| 1413 | `targetFieldExists` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id === rel.targetF` |
| 1430 | `processTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table: DBTable) =>` |
| 1432 | `processedFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(field) =>` |
| 1447 | `validCheckConstraints` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |

#### `src/lib/dbml/dbml-import/__tests__/composite-pk-name.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 34 | `pkIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) =>` |
| 41 | `pkFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 51 | `uniqueIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) =>` |
| 148 | `pkIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) =>` |
| 179 | `pkIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) =>` |

#### `src/lib/dbml/dbml-import/__tests__/dbml-array-fields.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 36 | `components` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'comp` |
| 39 | `elementalTypes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'elem` |
| 54 | `idField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 76 | `abilities` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 81 | `inventorySlots` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'inve` |
| 87 | `skillLevels` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'skil` |
| 95 | `questLog` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 119 | `id` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 122 | `speciesName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'spec` |
| 127 | `dangerLevel` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'dang` |
| 133 | `habitats` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 136 | `resistances` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'resi` |
| 169 | `rewardItems` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'rewa` |
| 172 | `requiredSkills` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'requ` |
| 195 | `reimportedRewards` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'rewa` |
| 198 | `reimportedSkills` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'requ` |
| 240 | `classSpecs` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'clas` |
| 246 | `questIds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'comp` |
| 251 | `skillRatings` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'skil` |
| 258 | `titles` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |

#### `src/lib/dbml/dbml-import/__tests__/dbml-cardinality-import.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/dbml/dbml-import/__tests__/dbml-character-varying.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 22 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 25 | `currencyField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 28 | `referenceField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 61 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 64 | `usernameField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 65 | `emailField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 104 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 108 | `currencyField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 111 | `referenceField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 114 | `amountField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 115 | `exchangeRateField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 156 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 158 | `productCodeField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 161 | `categoryField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 162 | `statusField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 163 | `descriptionField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |

#### `src/lib/dbml/dbml-import/__tests__/dbml-check-constraints-validation.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/dbml/dbml-import/__tests__/dbml-import-cases.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 18 | `expectFieldsMatch` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function expectFieldsMatch( actualFields: DBField[], expectedFields: DBField[] ): void { expect(actualFields).toHaveLength(expectedFields.length); for (let i` |
| 78 | `expectTablesMatch` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function expectTablesMatch( actualTables: DBTable[], expectedTables: DBTable[], databaseType: DatabaseType ): void { expect(actualTables).toHaveLength(expectedTables.length);` |
| 86 | `sortedActual` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a, b) =>` |
| 89 | `sortedExpected` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a, b) =>` |
| 119 | `hasPrimaryKeyField` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(f) =>` |
| 124 | `pkIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) =>` |
| 137 | `expectRelationshipsMatch` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function expectRelationshipsMatch( actualRelationships: DBRelationship[], expectedRelationships: DBRelationship[], actualTables: DBTable[], expectedTables: DBTable[] ): void { expect(actualRelationships).toHaveLength(...` |
| 171 | `sortRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( rels: DBRelationship[], tableMap: Map<string, string>, fieldMap: Map<string, FieldMapEntry> ) =>` |
| 255 | `testDBMLImportCase` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async function testDBMLImportCase(caseNumber: string): Promise<void> { // Read the DBML file` |
| 324 | `priceField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 328 | `isActiveField` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(f) =>` |
| 332 | `statusField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 336 | `descField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 340 | `createdAtField` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(f) => f.name === '` |
| 364 | `idField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 371 | `field2` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 376 | `field3` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 382 | `field4` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 404 | `idField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 410 | `counterField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 415 | `smallCounterField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 422 | `regularField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |

#### `src/lib/dbml/dbml-import/__tests__/dbml-import-fantasy-examples.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 176 | `wizardsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'wiza` |
| 184 | `emailIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) =>` |
| 190 | `emailField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'emai` |
| 197 | `mentorRelationship` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 380 | `merchantsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'merc` |
| 387 | `artifactsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'arti` |
| 390 | `typeField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'type` |
| 396 | `tradeOffersTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'trad` |
| 399 | `offeredItemsField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'offe` |
| 408 | `inventoryTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'merc` |
| 411 | `compositeIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) => idx.fieldIds.len` |
| 583 | `questsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'ques` |
| 586 | `difficultyField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'diff` |
| 589 | `statusField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'stat` |
| 602 | `questPrereqTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'ques` |
| 614 | `assignmentsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'ques` |
| 617 | `uniqueAssignmentIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) => idx.unique && id` |
| 676 | `jobStatusEnum` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(ct) => ct.name === 'job` |
| 689 | `employeeTypeEnum` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(ct) => ct.name === 'emp` |
| 702 | `gradeEnum` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(ct) => ct.name === 'gra` |
| 713 | `employeesTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'empl` |
| 716 | `statusField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'stat` |
| 719 | `typeField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'type` |
| 722 | `gradeField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'perf` |
| 732 | `projectsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'proj` |
| 735 | `priorityField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'prio` |
| 810 | `publicStatusEnum` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(ct) => ct.name === 'sta` |
| 821 | `adminStatusEnum` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(ct) => ct.name === 'sta` |
| 834 | `publicUsersTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'user` |
| 837 | `adminUsersTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'user` |
| 841 | `publicStatusField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'stat` |
| 844 | `adminStatusField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'stat` |
| 915 | `hoardsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'drag` |
| 918 | `manifestField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'item` |
| 921 | `spellsField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'secu` |
| 929 | `guardianField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'guar` |
| 941 | `uniqueDragonIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) => idx.name === 'id` |
| 949 | `hoardValueIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) => idx.name === 'id` |
| 957 | `dragonActiveIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) => idx.name === 'id` |
| 1026 | `aaUsersTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'user` |
| 1029 | `bbUsersTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'user` |
| 1105 | `usersTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'user` |
| 1108 | `postsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'post` |
| 1111 | `commentsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'comm` |
| 1150 | `compositeIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) => idx.name === 'pu` |
| 1168 | `singleIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) => idx.name === 'pu` |
| 1185 | `idIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) => idx.name === 'pu` |
| 1205 | `findRelationshipByFields` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( sourceTableId: string, sourceFieldName: string, targetTableId: string, targetFieldName: string ) =>` |
| 1211 | `sourceField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 1214 | `targetField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 1259 | `allOneToMany` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 1267 | `relationshipsHaveSchemas` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 1311 | `totalField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'tota` |

#### `src/lib/dbml/dbml-import/__tests__/dbml-import.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 117 | `usersTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 122 | `domainsField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'doma` |
| 128 | `verificationField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'veri` |
| 228 | `usersTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 231 | `nameField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 235 | `emailField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'emai` |

#### `src/lib/dbml/dbml-import/__tests__/dbml-integration.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 55 | `usersTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 59 | `emailField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 69 | `postsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 72 | `userPostRelation` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 108 | `usersTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 109 | `statusField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 113 | `tagsField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 117 | `productsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === '` |

#### `src/lib/dbml/dbml-import/__tests__/dbml-multi-schema-relationships.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 69 | `salesProducts` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'prod` |
| 72 | `inventoryProducts` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'prod` |
| 75 | `productSuppliers` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 114 | `productIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'prod` |
| 117 | `inventoryProductsIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'id'` |
| 181 | `salesProducts` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'prod` |
| 184 | `inventoryProducts` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'prod` |
| 187 | `productSuppliers` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 222 | `productIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'prod` |
| 225 | `inventoryProductsIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === 'id'` |

#### `src/lib/dbml/dbml-import/__tests__/dbml-pk-not-null.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 17 | `usersTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 20 | `idField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 25 | `nameField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 46 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 49 | `orderIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 53 | `productIdField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === '` |
| 60 | `quantityField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |

#### `src/lib/dbml/dbml-import/__tests__/dbml-schema-handling.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 49 | `wizardsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'wiza` |
| 56 | `yesField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 57 | `noField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 162 | `heroesTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'hero` |
| 167 | `secretQuestsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'secr` |
| 172 | `artifactsTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'arti` |
| 260 | `magicTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'magi` |
| 263 | `questTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 324 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === 'Work` |
| 330 | `yesField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 331 | `noField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 379 | `originalTableIds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 412 | `currentTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.name === original.name` |

#### `src/lib/dbml/dbml-import/dbml-import-error.ts`

บทบาท: นำเข้า ส่งออก หรือ apply DBML. Exports: `DBMLError`, `DBMLValidationError`, `getPositionFromIndex`, `parseDBMLError`, `validateArrayTypesForDatabase`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 21 | `getPositionFromIndex` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( content: string, matchIndex: number ): { line: number; column: number } =>` |
| 32 | `validateArrayTypesForDatabase` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `( content: string, databaseType: DatabaseType ): void =>` |
| 57 | `parseDBMLError` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `export function parseDBMLError(error: unknown): DBMLError \| null {` |
| 81 | `getFirstErrorFromCompileError` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( error: CompilerError ): DBMLError \| null =>` |
| 84 | `diags` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a, b) =>` |

#### `src/lib/dbml/dbml-import/dbml-import.ts`

บทบาท: นำเข้า ส่งออก หรือ apply DBML. Exports: `defaultDBMLDiagramName`, `importDBMLToDiagram`, `preprocessDBML`, `sanitizeDBML`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 54 | `findMatchingBrace` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(str: string, startIndex: number): number =>` |
| 64 | `preprocessDBML` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `(content: string): PreprocessDBMLResult =>` |
| 241 | `sanitizeDBML` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(content: string): string =>` |
| 326 | `mapDBMLTypeToDataType` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `( dbmlType: string, options?: { databaseType?: DatabaseType; enums?: DBMLEnum[] } ): DataTypeData =>` |
| 334 | `enumDef` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) =>` |
| 368 | `relationToCardinality` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(relation: '1' \| '*'): Cardinality =>` |
| 372 | `importDBMLToDiagram` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `async ( dbmlContent: string, options: { databaseType: DatabaseType; } ): Promise<Diagram> =>` |
| 438 | `getFieldExtraAttributes` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( field: Field, enums: DBMLEnum[] ): Partial<DBMLField> =>` |
| 691 | `tables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table, index) =>` |
| 697 | `fields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(field) =>` |
| 768 | `field` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 786 | `indexColumns` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(col) =>` |
| 825 | `fieldIds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(columnName) =>` |
| 826 | `field` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === columnName` |
| 873 | `pkFieldIds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(columnName) =>` |
| 874 | `field` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 986 | `findTableByEndpoint` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( endpoint: DBMLEndpoint ): DBTable \| undefined =>` |
| 1010 | `relationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(ref) => {` |
| 1020 | `sourceField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === source.fi` |
| 1023 | `targetField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.name === target.fi` |
| 1057 | `customTypes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(enumDef) => {` |
| 1060 | `values` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(v) =>` |

#### `src/lib/dbml/dbml-import/verify-dbml.ts`

บทบาท: นำเข้า ส่งออก หรือ apply DBML. Exports: `verifyDBML`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 10 | `verifyDBML` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `( content: string, { databaseType, }: { databaseType: DatabaseType; } ): \| { hasError: true; error: unknown; parsedError?: DBMLError; errorText: string; } \| { hasError: false; } =>` |

### `src/lib/domain`

#### `src/lib/domain/__tests__/composite-pk-metadata-import.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 174 | `pkIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) =>` |
| 179 | `pkFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 189 | `uniqueIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) =>` |

#### `src/lib/domain/area.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `Area`, `areaSchema`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/domain/config.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `ChartDBConfig`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/domain/database-capabilities.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `DATABASE_CAPABILITIES`, `DatabaseCapabilities`, `databaseSupportsArrays`, `databaseTypesWithCommentSupport`, `getDatabaseCapabilities`, `supportsCheckConstraints`, `supportsCustomTypes`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 50 | `getDatabaseCapabilities` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( databaseType: DatabaseType ): DatabaseCapabilities =>` |
| 56 | `databaseSupportsArrays` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(databaseType: DatabaseType): boolean =>` |
| 60 | `databaseTypesWithCommentSupport` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dbType) => DATA` |
| 66 | `supportsCustomTypes` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(databaseType: DatabaseType): boolean =>` |
| 70 | `supportsCheckConstraints` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `( databaseType: DatabaseType ): boolean =>` |

#### `src/lib/domain/database-clients.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `DatabaseClient`, `databaseClientToLabelMap`, `databaseEditionToClientsMap`, `databaseTypeToClientsMap`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/domain/database-edition.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `DatabaseEdition`, `databaseEditionToImageMap`, `databaseEditionToLabelMap`, `databaseTypeToEditionMap`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/domain/database-type.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `DatabaseType`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/domain/db-check-constraint.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `DBCheckConstraint`, `dbCheckConstraintSchema`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/domain/db-custom-type.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `DBCustomType`, `DBCustomTypeField`, `DBCustomTypeKind`, `customTypeKindToLabel`, `dbCustomTypeFieldSchema`, `dbCustomTypeSchema`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/domain/db-dependency.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `DBDependency`, `dbDependencySchema`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/domain/db-field.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `DBField`, `dbFieldSchema`, `generateDBFieldSuffix`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 48 | `generateDBFieldSuffix` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `( field: DBField, { databaseType, forceExtended = false, typeId, }: { databaseType?: DatabaseType; forceExtended?: boolean; typeId?: string; } = {} ): string =>` |
| 82 | `generateExtendedSuffix` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `( field: DBField, databaseType: DatabaseType, typeId: string ): string =>` |
| 115 | `generateStandardSuffix` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(field: DBField): string =>` |
| 124 | `formatPrecisionAndScale` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `( precision: number \| null \| undefined, scale: number \| null \| undefined, fallback: string ): string =>` |

#### `src/lib/domain/db-index.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `DBIndex`, `INDEX_TYPES`, `INDEX_TYPE_CONFIGS`, `IndexType`, `IndexTypeConfig`, `canFieldsUseGinIndex`, `databaseIndexTypes`, `dbIndexSchema`, `defaultIndexTypeForDatabase`, `getTableIndexesWithPrimaryKey`, `getTablePrimaryKeyIndex`, `supportsGinIndex`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 78 | `supportsGinIndex` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(field: DBField): boolean =>` |
| 86 | `canFieldsUseGinIndex` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(fields: DBField[]): boolean =>` |
| 107 | `getTablePrimaryKeyIndex` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ table, }: { table: DBTable; }): DBIndex \| null =>` |
| 112 | `primaryKeyFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 113 | `existingPKIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) =>` |
| 119 | `pkFieldIds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 142 | `getTableIndexesWithPrimaryKey` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ table, }: { table: DBTable; }): DBIndex[] =>` |
| 148 | `indexesWithoutPKIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(idx) => !idx.isP` |

#### `src/lib/domain/db-relationship.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `Cardinality`, `DBRelationship`, `RelationshipType`, `dbRelationshipSchema`, `determineCardinalities`, `determineRelationshipType`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 38 | `determineRelationshipType` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ sourceCardinality, targetCardinality, }: { sourceCardinality: Cardinality; targetCardinality: Cardinality; }): RelationshipType =>` |
| 54 | `determineCardinalities` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( relationshipType: RelationshipType ): { sourceCardinality: Cardinality; targetCardinality: Cardinality; } =>` |

#### `src/lib/domain/db-schema.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `DBSchema`, `databasesWithSchemas`, `schemaNameToDomainSchemaName`, `schemaNameToSchemaId`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 10 | `schemaNameToSchemaId` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(schema: string): string =>` |
| 13 | `schemaNameToDomainSchemaName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( schema: string \| null \| undefined ): string \| undefined =>` |
| 22 | `databasesWithSchemas` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dbType) => DATA` |

#### `src/lib/domain/db-table.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `DBTable`, `MAX_TABLE_SIZE`, `MID_TABLE_SIZE`, `MIN_TABLE_SIZE`, `TABLE_MINIMIZED_FIELDS`, `adjustTablePositions`, `adjustTablePositionsWithoutAreas`, `calcTableHeight`, `dbTableSchema`, `generateTableKey`, `getTableDimensions`, `positionTablesWithinArea`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 58 | `generateTableKey` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `({ schemaName, tableName, }: { schemaName: string \| null \| undefined; tableName: string; }) =>` |
| 66 | `adjustTablePositions` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ relationships: inputRelationships, tables: inputTables, areas: inputAreas = [], mode = 'all', }: { tables: DBTable[]; relationships: DBRelationship[]; areas?: Area[]; mode?: 'all' \| 'perSchema'; }): DBTable[] =>` |
| 122 | `tablesToReposition` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) =>` |
| 128 | `areaRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(rel) =>` |
| 129 | `sourceNeedsReposition` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === rel.sourceT` |
| 132 | `targetNeedsReposition` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === rel.targetT` |
| 152 | `freeRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(rel) =>` |
| 153 | `sourceIsFree` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === rel.sou` |
| 156 | `targetIsFree` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === rel.tar` |
| 175 | `isTableInsideArea` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `function isTableInsideArea(table: DBTable, area: Area): boolean { const tableDimensions = getTableDimensions(table);` |
| 188 | `positionTablesWithinArea` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export function positionTablesWithinArea( tables: DBTable[], _relationships: DBRelationship[], area: Area ) { if (tables.length === 0) return; const padd` |
| 231 | `adjustTablePositionsWithoutAreas` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export function adjustTablePositionsWithoutAreas( tables: DBTable[], relationships: DBRelationship[], mode: 'all' \| 'perSchema', areas: Area[] = [] ): DBTable[] { const adjustPositionsForTables = (tab` |
| 237 | `adjustPositionsForTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(tablesToAdjust: DBTable[]) =>` |
| 283 | `getTableWidthAndHeight` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( tableId: string ): { width: number; height: number; } =>` |
| 289 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 297 | `isOverlapping` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `( x: number, y: number, currentTableId: string ): boolean =>` |
| 337 | `findNonOverlappingPosition` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( baseX: number, baseY: number, tableId: string ): { x: number; y: number } =>` |
| 370 | `positionTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( table: DBTable, baseX: number, baseY: number ) =>` |
| 391 | `connectedTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === connectedTableI` |
| 504 | `tablesBySchema` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(acc, table) => {` |
| 526 | `calcTableHeight` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table?: DBTable): number =>` |
| 551 | `getTableDimensions` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( table: DBTable ): { width: number; height: number } =>` |

#### `src/lib/domain/diagram-filter/diagram-filter.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `DiagramFilter`, `FilterTableInfo`, `reduceFilter`, `spreadFilterTables`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 21 | `reduceFilter` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export function reduceFilter( filter: DiagramFilter, tables: FilterTableInfo[], options: { databaseWithSchemas: boolean } ): DiagramFilter { let { schemaIds, tableIds } = filter; // If no filters are defined, everythi...` |
| 41 | `allTableIds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 93 | `allSchemasIncluded` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(id) =>` |
| 106 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 122 | `visibleTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) =>` |
| 136 | `visibleTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) => table.schema` |
| 156 | `spreadFilterTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( filter: DiagramFilter, tables: FilterTableInfo[] ): DiagramFilter =>` |

#### `src/lib/domain/diagram-filter/filter.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `applyFilterOnDiagram`, `filterDependency`, `filterRelationship`, `filterTable`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 6 | `filterTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ table, filter, options = { defaultSchema: undefined }, }: { table: { id: string; schema?: string \| null }; filter?: DiagramFilter; options?: { defaultSchema?: string; }; }): boolean =>` |
| 42 | `filterRelationship` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ tableA: { id: tableAId, schema: tableASchema }, tableB: { id: tableBId, schema: tableBSchema }, filter, options = { defaultSchema: undefined }, }: { tableA: { id: string; schema?: string \| null }; tableB: { id: st...` |
| 76 | `applyFilterOnDiagram` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `({ diagram, filter, }: { diagram: Diagram; filter: DiagramFilter; }): Diagram =>` |
| 84 | `filteredTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) =>` |
| 92 | `filteredRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(relationship) =>` |
| 108 | `filteredDependencies` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(dependency) =>` |
| 123 | `filteredAreas` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(area) =>` |

#### `src/lib/domain/diagram.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `Diagram`, `diagramSchema`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/domain/diff/area-diff.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `AreaDiff`, `AreaDiffAdded`, `AreaDiffAttribute`, `AreaDiffChanged`, `AreaDiffChangedSchema`, `AreaDiffRemoved`, `AreaDiffRemovedSchema`, `createAreaDiffAddedSchema`, `createAreaDiffSchema`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 56 | `createAreaDiffAddedSchema` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `<T = Area>( areaSchema: z.ZodType<T> ): z.ZodType<AreaDiffAdded<T>> =>` |
| 71 | `createAreaDiffSchema` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `<T = Area>( areaSchema: z.ZodType<T> ): z.ZodType<AreaDiff<T>> =>` |

#### `src/lib/domain/diff/check-constraint-diff.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `CheckConstraintDiff`, `CheckConstraintDiffAdded`, `CheckConstraintDiffAttribute`, `CheckConstraintDiffChanged`, `CheckConstraintDiffRemoved`, `checkConstraintDiffAttributeSchema`, `checkConstraintDiffChangedSchema`, `checkConstraintDiffRemovedSchema`, `createCheckConstraintDiffAddedSchema`, `createCheckConstraintDiffSchema`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 16 | `createCheckConstraintDiffAddedSchema` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `<T = DBCheckConstraint>( checkConstraintSchema: z.ZodType<T> ): z.ZodType<CheckConstraintDiffAdded<T>> =>` |
| 70 | `createCheckConstraintDiffSchema` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `<T = DBCheckConstraint>( checkConstraintSchema: z.ZodType<T> ): z.ZodType<CheckConstraintDiff<T>> =>` |

#### `src/lib/domain/diff/diff-check/__tests__/diff-check.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 19 | `createMockDiagram` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `function createMockDiagram(overrides?: Partial<Diagram>): Diagram { return { id: 'diagram-1',` |
| 34 | `createMockTable` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `function createMockTable(overrides?: Partial<DBTable>): DBTable { return { id: 'table-1',` |
| 47 | `createMockField` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `function createMockField(overrides?: Partial<DBField>): DBField { return { id: 'field-1',` |
| 60 | `createMockRelationship` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `function createMockRelationship( overrides?: Partial<DBRelationship> ): DBRelationship { return { id: 'rel-1', name:` |
| 78 | `createMockArea` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `function createMockArea(overrides?: Partial<Area>): Area { return { id: 'area-1',` |
| 92 | `createMockNote` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `function createMockNote(overrides?: Partial<Note>): Note { return { id: 'note-1',` |
| 106 | `createMockIndex` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `function createMockIndex(overrides?: Partial<DBIndex>): DBIndex { return { id: 'index-1',` |
| 819 | `added` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(d) => d.type === 'adde` |
| 822 | `removed` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(d) => d.type === 'remo` |
| 1160 | `addedRelationships` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(diff) =>` |
| 1169 | `removedRelationships` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(diff) =>` |
| 1989 | `addedNotes` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(diff) => diff.type === 'a` |
| 1995 | `removedNotes` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(diff) => diff.type === 'r` |
| 2037 | `contentChanges` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(diff) =>` |
| 2046 | `otherChanges` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(diff) =>` |
| 2202 | `addedTables` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(diff) => diff.type === 'a` |
| 2208 | `removedTables` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(diff) => diff.type === 'r` |
| 2247 | `nameChanges` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(diff) =>` |
| 2256 | `otherChanges` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(diff) =>` |

#### `src/lib/domain/diff/diff-check/diff-check.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `GenerateDiffOptions`, `generateDiff`, `getDiffMapKey`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 32 | `getDiffMapKey` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `export function getDiffMapKey({ diffObject, objectId, attribute, }: { diffObject: DiffObject; objectId: string; attribute?: string; }): string {` |
| 46 | `isOneOfDefined` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `( ...values: (string \| number \| boolean \| undefined \| null)[] ): boolean =>` |
| 52 | `normalizeBoolean` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `(value: boolean \| undefined \| null): boolean =>` |
| 66 | `normalizeComment` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `( value: string \| undefined \| null ): string \| undefined =>` |
| 81 | `areCommentsDifferent` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( oldComment: string \| undefined \| null, newComment: string \| undefined \| null ): boolean =>` |
| 106 | `shouldAddToChangedMap` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `<T>( attribute: T, changedAttributes?: T[] ): boolean =>` |
| 155 | `table` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(table: DBTable, tables: DBTable[]) => DBTable \| undefined` |
| 156 | `field` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(field: DBField, fields: DBField[]) => DBField \| undefined` |
| 157 | `index` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(index: DBIndex, indexes: DBIndex[]) => DBIndex \| undefined` |
| 158 | `checkConstraint` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `( constraint: DBCheckConstraint, constraints: DBCheckConstraint[] ) => DBCheckConstraint \| undefined` |
| 162 | `relationship` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `( relationship: DBRelationship, relationships: DBRelationship[] ) => DBRelationship \| undefined` |
| 166 | `area` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(area: Area, areas: Area[]) => Area \| undefined` |
| 167 | `note` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(note: Note, notes: Note[]) => Note \| undefined` |
| 171 | `generateDiff` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `export function generateDiff({ diagram, newDiagram, options = {}, }: { diagram: Diagram; newDiagram: Diagram; options?: GenerateDiffOptions; }): { diffMap: DiffMap; changedTables: Map<string, boolean>; changedFields: ...` |
| 327 | `compareTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function compareTables({ diagram, newDiagram, diffMap, changedTables, attributes, changedTablesAttributes, changeTypes, tableMatcher, }: { diagram: Diagram; newDiagram: Diagram; diffMap: DiffMap; changedTables: Map<st...` |
| 344 | `tableMatcher` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(table: DBTable, tables: DBTable[]) => DBTable \| undefined` |
| 567 | `compareTableContents` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function compareTableContents({ diagram, newDiagram, diffMap, changedTables, changedFields, changedIndexes, changedCheckConstraints, options, changedTablesAttributes, changedFieldsAttributes, changedIndexesAttributes,...` |
| 598 | `tableMatcher` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(table: DBTable, tables: DBTable[]) => DBTable \| undefined` |
| 599 | `fieldMatcher` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(field: DBField, fields: DBField[]) => DBField \| undefined` |
| 600 | `indexMatcher` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(index: DBIndex, indexes: DBIndex[]) => DBIndex \| undefined` |
| 601 | `checkConstraintMatcher` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `( constraint: DBCheckConstraint, constraints: DBCheckConstraint[] ) => DBCheckConstraint \| undefined` |
| 670 | `compareFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function compareFields({ tableId, oldFields, newFields, diffMap, changedTables, changedFields, attributes, changedTablesAttributes, changedFieldsAttributes, changeTypes, fieldMatcher, }: { tableId: string; oldFields: ...` |
| 693 | `fieldMatcher` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(field: DBField, fields: DBField[]) => DBField \| undefined` |
| 770 | `compareFieldProperties` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function compareFieldProperties({ tableId, oldField, newField, diffMap, changedTables, changedFields, attributes, changedTablesAttributes, changedFieldsAttributes, }: { tableId: string; oldField: DBField; newField: DB...` |
| 891 | `attributesThatTriggerChange` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(attr) =>` |
| 934 | `compareIndexes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function compareIndexes({ tableId, oldIndexes, newIndexes, diffMap, changedTables, changedIndexes, attributes, changedTablesAttributes, changedIndexesAttributes, changeTypes, indexMatcher, databaseType, }: { tableId: ...` |
| 958 | `indexMatcher` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(index: DBIndex, indexes: DBIndex[]) => DBIndex \| undefined` |
| 1046 | `areFieldIdsEqual` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( oldFieldIds: string[], newFieldIds: string[] ): boolean =>` |
| 1062 | `compareIndexProperties` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function compareIndexProperties({ tableId, oldIndex, newIndex, diffMap, changedTables, changedIndexes, attributes, changedTablesAttributes, changedIndexesAttributes, databaseType, }: { tableId: string; oldIndex: DBInd...` |
| 1135 | `attributesThatTriggerChange` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(attr) =>` |
| 1174 | `compareCheckConstraints` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function compareCheckConstraints({ tableId, oldCheckConstraints, newCheckConstraints, diffMap, changedTables, changedCheckConstraints, attributes, changedTablesAttributes, changedCheckConstraintsAttributes, changeType...` |
| 1197 | `checkConstraintMatcher` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `( constraint: DBCheckConstraint, constraints: DBCheckConstraint[] ) => DBCheckConstraint \| undefined` |
| 1318 | `compareRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function compareRelationships({ diagram, newDiagram, diffMap, changedRelationships, relationshipIdMap, attributes, changedRelationshipsAttributes, changeTypes, relationshipMatcher, }: { diagram: Diagram; newDiagram: D...` |
| 1337 | `relationshipMatcher` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `( relationship: DBRelationship, relationships: DBRelationship[] ) => DBRelationship \| undefined` |
| 1415 | `compareRelationshipProperties` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function compareRelationshipProperties({ oldRelationship, newRelationship, diffMap, changedRelationships, relationshipIdMap, attributes, changedRelationshipsAttributes, }: { oldRelationship: DBRelationship; newRelatio...` |
| 1539 | `attributesThatTriggerChange` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(attr) =>` |
| 1575 | `compareAreas` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function compareAreas({ diagram, newDiagram, diffMap, changedAreas, attributes, changedAreasAttributes, changeTypes, areaMatcher, }: { diagram: Diagram; newDiagram: Diagram; diffMap: DiffMap; changedAreas: Map<string,...` |
| 1592 | `areaMatcher` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(area: Area, areas: Area[]) => Area \| undefined` |
| 1806 | `compareNotes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `function compareNotes({ diagram, newDiagram, diffMap, changedNotes, attributes, changedNotesAttributes, changeTypes, noteMatcher, }: { diagram: Diagram; newDiagram: Diagram; diffMap: DiffMap; changedNotes: Map<string,...` |
| 1823 | `noteMatcher` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(note: Note, notes: Note[]) => Note \| undefined` |
| 2036 | `defaultTableMatcher` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( table: DBTable, tables: DBTable[] ): DBTable \| undefined =>` |
| 2043 | `defaultFieldMatcher` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( field: DBField, fields: DBField[] ): DBField \| undefined =>` |
| 2050 | `defaultIndexMatcher` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( index: DBIndex, indexes: DBIndex[] ): DBIndex \| undefined =>` |
| 2055 | `byId` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(i) =>` |
| 2062 | `byName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(i) =>` |
| 2073 | `byFieldIds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(i) =>` |
| 2085 | `defaultCheckConstraintMatcher` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( constraint: DBCheckConstraint, constraints: DBCheckConstraint[] ): DBCheckConstraint \| undefined =>` |
| 2090 | `byId` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) =>` |
| 2097 | `byExpression` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(c) => c.expression` |
| 2108 | `defaultRelationshipMatcher` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( relationship: DBRelationship, relationships: DBRelationship[] ): DBRelationship \| undefined =>` |
| 2113 | `byId` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 2120 | `byName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) => r.name === r` |
| 2129 | `byStructure` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(r) =>` |
| 2143 | `defaultAreaMatcher` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(area: Area, areas: Area[]): Area \| undefined =>` |
| 2147 | `defaultNoteMatcher` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(note: Note, notes: Note[]): Note \| undefined =>` |

#### `src/lib/domain/diff/diff.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `ChartDBDiff`, `DiffKind`, `DiffMap`, `DiffObject`, `createChartDBDiffSchema`, `isDiffOfKind`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 44 | `createChartDBDiffSchema` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `< TTable = DBTable, TField = DBField, TIndex = DBIndex, TCheckConstraint = DBCheckConstraint, TRelationship = DBRelationship, TArea = Area, TNote = Note, >( tableSchema: z.ZodType<TTable>, fieldSchema: z.ZodType<TFiel...` |
| 156 | `isDiffOfKind` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `< TTable = DBTable, TField = DBField, TIndex = DBIndex, TCheckConstraint = DBCheckConstraint, TRelationship = DBRelationship, TArea = Area, TNote = Note, >( diff: ChartDBDiff< TTable, TField, TIndex, TCheckConstraint,...` |

#### `src/lib/domain/diff/field-diff.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `FieldDiff`, `FieldDiffAdded`, `FieldDiffAttribute`, `FieldDiffChanged`, `FieldDiffRemoved`, `createFieldDiffAddedSchema`, `createFieldDiffSchema`, `fieldDiffAttributeSchema`, `fieldDiffChangedSchema`, `fieldDiffRemovedSchema`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 42 | `createFieldDiffAddedSchema` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `<T = DBField>( fieldSchema: z.ZodType<T> ): z.ZodType<FieldDiffAdded<T>> =>` |
| 94 | `createFieldDiffSchema` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `<T = DBField>( fieldSchema: z.ZodType<T> ): z.ZodType<FieldDiff<T>> =>` |

#### `src/lib/domain/diff/index-diff.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `IndexDiff`, `IndexDiffAdded`, `IndexDiffAttribute`, `IndexDiffChanged`, `IndexDiffRemoved`, `createIndexDiffAddedSchema`, `createIndexDiffSchema`, `indexDiffAttributeSchema`, `indexDiffChangedSchema`, `indexDiffRemovedSchema`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 26 | `createIndexDiffAddedSchema` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `<T = DBIndex>( indexSchema: z.ZodType<T> ): z.ZodType<IndexDiffAdded<T>> =>` |
| 82 | `createIndexDiffSchema` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `<T = DBIndex>( indexSchema: z.ZodType<T> ): z.ZodType<IndexDiff<T>> =>` |

#### `src/lib/domain/diff/note-diff.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `NoteDiff`, `NoteDiffAdded`, `NoteDiffAttribute`, `NoteDiffChanged`, `NoteDiffChangedSchema`, `NoteDiffRemoved`, `NoteDiffRemovedSchema`, `createNoteDiffAddedSchema`, `createNoteDiffSchema`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 56 | `createNoteDiffAddedSchema` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `<T = Note>( noteSchema: z.ZodType<T> ): z.ZodType<NoteDiffAdded<T>> =>` |
| 71 | `createNoteDiffSchema` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `<T = Note>( noteSchema: z.ZodType<T> ): z.ZodType<NoteDiff<T>> =>` |

#### `src/lib/domain/diff/relationship-diff.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `RelationshipDiff`, `RelationshipDiffAdded`, `RelationshipDiffAttribute`, `RelationshipDiffChanged`, `RelationshipDiffRemoved`, `createRelationshipDiffAddedSchema`, `createRelationshipDiffSchema`, `relationshipDiffAttributeSchema`, `relationshipDiffChangedSchema`, `relationshipDiffRemovedSchema`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 34 | `createRelationshipDiffAddedSchema` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `<T = DBRelationship>( relationshipSchema: z.ZodType<T> ): z.ZodType<RelationshipDiffAdded<T>> =>` |
| 83 | `createRelationshipDiffSchema` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `<T = DBRelationship>( relationshipSchema: z.ZodType<T> ): z.ZodType<RelationshipDiff<T>> =>` |

#### `src/lib/domain/diff/table-diff.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `TableDiff`, `TableDiffAdded`, `TableDiffAttribute`, `TableDiffChanged`, `TableDiffChangedSchema`, `TableDiffRemoved`, `TableDiffRemovedSchema`, `createTableDiffAddedSchema`, `createTableDiffSchema`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 56 | `createTableDiffAddedSchema` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `<T = DBTable>( tableSchema: z.ZodType<T> ): z.ZodType<TableDiffAdded<T>> =>` |
| 71 | `createTableDiffSchema` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `<T = DBTable>( tableSchema: z.ZodType<T> ): z.ZodType<TableDiff<T>> =>` |

#### `src/lib/domain/index.ts`

บทบาท: domain model, schema, rule หรือ diff model. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/domain/note.ts`

บทบาท: domain model, schema, rule หรือ diff model. Exports: `Note`, `noteSchema`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

### `src/lib/env.ts`

#### `src/lib/env.ts`

บทบาท: utility และ business logic. Exports: `APP_URL`, `DISABLE_ANALYTICS`, `HIDE_CHARTDB_CLOUD`, `HOST_URL`, `IS_CHARTDB_IO`, `LLM_MODEL_NAME`, `OPENAI_API_ENDPOINT`, `OPENAI_API_KEY`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

### `src/lib/export-import-utils.ts`

#### `src/lib/export-import-utils.ts`

บทบาท: utility และ business logic. Exports: `cloneDiagramWithRunningIds`, `diagramFromJSONInput`, `diagramToJSONOutput`, `runningIdGenerator`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 5 | `runningIdGenerator` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(): (() => string) =>` |
| 10 | `cloneDiagramWithRunningIds` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `( diagram: Diagram ): { diagram: Diagram; idsMap: Map<string, string> } =>` |
| 20 | `cloneDiagramWithIds` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(diagram: Diagram): Diagram =>` |
| 25 | `diagramToJSONOutput` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(diagram: Diagram): string =>` |
| 30 | `diagramFromJSONInput` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(json: string): Diagram =>` |

### `src/lib/graph.ts`

#### `src/lib/graph.ts`

บทบาท: utility และ business logic. Exports: `Graph`, `addEdge`, `addVertex`, `createGraph`, `getNeighbors`, `removeEdge`, `removeVertex`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 6 | `createGraph` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `<T>(): Graph<T> =>` |
| 11 | `addVertex` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `<T>(graph: Graph<T>, vertex: T): Graph<T> =>` |
| 18 | `addEdge` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `<T>( graph: Graph<T>, source: T, destination: T ): Graph<T> =>` |
| 41 | `getNeighbors` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `<T>(graph: Graph<T>, vertex: T): T[] \| undefined =>` |
| 44 | `removeVertex` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `<T>(graph: Graph<T>, vertex: T): Graph<T> =>` |
| 55 | `removeEdge` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `<T>( graph: Graph<T>, source: T, destination: T ): Graph<T> =>` |

### `src/lib/import-method`

#### `src/lib/import-method/__tests__/detect-import-type.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/import-method/detect-import-method.ts`

บทบาท: utility และ business logic. Exports: `detectImportMethod`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 3 | `detectImportMethod` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(content: string): ImportMethod \| null =>` |
| 19 | `hasDBMLPatterns` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(pattern) =>` |
| 38 | `hasDDLKeywords` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(keyword) =>` |

#### `src/lib/import-method/import-method.ts`

บทบาท: utility และ business logic. Exports: `ImportMethod`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

### `src/lib/types.ts`

#### `src/lib/types.ts`

บทบาท: utility และ business logic. Exports: `EffectiveTheme`, `Theme`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

### `src/lib/utils`

#### `src/lib/utils/__tests__/apply-ids.test.ts`

บทบาท: ชุดทดสอบและกรณี regression. ไม่มี named export.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 16 | `createBaseDiagram` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(overrides?: Partial<Diagram>): Diagram =>` |
| 25 | `createTable` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(overrides: Partial<DBTable>): DBTable =>` |
| 40 | `createField` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(overrides: Partial<DBField>): DBField =>` |
| 53 | `createIndex` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(overrides: Partial<DBIndex>): DBIndex =>` |
| 62 | `createRelationship` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `( overrides: Partial<DBRelationship> ): DBRelationship =>` |
| 77 | `createDependency` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `( overrides: Partial<DBDependency> ): DBDependency =>` |
| 87 | `createCustomType` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `( overrides: Partial<DBCustomType> ): DBCustomType =>` |

#### `src/lib/utils/apply-ids.ts`

บทบาท: utility และ business logic. Exports: `applyIds`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `createTableKey` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `({ table, defaultSchema, }: { table: DBTable; defaultSchema?: string; }) =>` |
| 14 | `createFieldKey` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `({ table, fieldName, defaultSchema, }: { table: DBTable; fieldName: string; defaultSchema?: string; }) =>` |
| 26 | `createIndexKey` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `({ table, indexName, defaultSchema, }: { table: DBTable; indexName: string; defaultSchema?: string; }) =>` |
| 38 | `createRelationshipKey` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `({ relationshipName, defaultSchema, }: { relationshipName: string; defaultSchema?: string; }) =>` |
| 48 | `createDependencyKey` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `({ table, dependentTable, defaultSchema, }: { table: DBTable; dependentTable: DBTable; defaultSchema?: string; }) =>` |
| 60 | `createCustomTypeKey` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `({ customType, defaultSchema, }: { customType: DBCustomType; defaultSchema?: string; }) =>` |
| 70 | `applyIds` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `({ sourceDiagram, targetDiagram, }: { sourceDiagram: Diagram; targetDiagram: Diagram; }): Diagram =>` |
| 124 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === dep` |
| 127 | `dependentTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === dep` |
| 205 | `table` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === dep` |
| 208 | `dependentTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.id === dep` |
| 259 | `updatedFieldIds` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(fieldId) =>` |

#### `src/lib/utils/area-utils.ts`

บทบาท: utility และ business logic. Exports: `arrangeTablesForArea`, `findContainingArea`, `getTablesInArea`, `isTableInsideArea`, `updateTablesParentAreas`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 14 | `isTableInsideArea` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(table: DBTable, area: Area): boolean =>` |
| 42 | `findContainingArea` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( table: DBTable, areas: Area[] ): Area \| null =>` |
| 47 | `sortedAreas` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a, b) => (b.order` |
| 63 | `updateTablesParentAreas` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `( tables: DBTable[], areas: Area[] ): DBTable[] =>` |
| 86 | `getTablesInArea` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( areaId: string, tables: DBTable[] ): DBTable[] =>` |
| 100 | `arrangeTablesForArea` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( tablesToArrange: DBTable[], relationships: DBRelationship[], areaRect: { x: number; y: number; width: number; height: number } ): { positions: { id: string; x: number; y: number }[]; requiredWidth: number; requiredH...` |
| 117 | `cloned` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(t) =>` |
| 120 | `areaRels` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(rel) => ids.has(` |

#### `src/lib/utils/index.ts`

บทบาท: utility และ business logic. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/lib/utils/utils.ts`

บทบาท: utility และ business logic. Exports: `areBooleansEqual`, `cn`, `debounce`, `decodeBase64ToUtf16LE`, `decodeBase64ToUtf8`, `deepCopy`, `emptyFn`, `generateDiagramId`, `generateId`, `getOperatingSystem`, `getWorkspaceId`, `isStringEmpty`, `mergeRefs`, `removeDups`, `sha256`, `waitFor`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 8 | `cn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export function cn(...inputs: ClassValue[]) {` |
| 13 | `emptyFn` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(): any =>` |
| 15 | `generateId` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `() =>` |
| 17 | `getWorkspaceId` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(): string =>` |
| 28 | `generateDiagramId` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `() =>` |
| 34 | `getOperatingSystem` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(): 'mac' \| 'windows' \| 'unknown' =>` |
| 45 | `deepCopy` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `<T>(obj: T): T =>` |
| 47 | `debounce` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `<T extends (...args: Parameters<T>) => ReturnType<T>>( func: T, waitFor: number ) =>` |
| 58 | `removeDups` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `<T>(array: T[]): T[] =>` |
| 62 | `decodeBase64ToUtf16LE` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(base64: string) =>` |
| 76 | `decodeBase64ToUtf8` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(base64: string) =>` |
| 88 | `waitFor` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async (ms: number): Promise<void> =>` |
| 92 | `sha256` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async (message: string): Promise<string> =>` |
| 105 | `mergeRefs` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `export function mergeRefs<T>( ...inputRefs: (React.Ref<T> \| undefined)[] ): React.Ref<T> \| React.RefCallback<T> {` |
| 127 | `isStringEmpty` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(str: string \| undefined \| null): boolean =>` |
| 131 | `areBooleansEqual` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( a: boolean \| undefined \| null, b: boolean \| undefined \| null ): boolean =>` |

### `src/main.tsx`

#### `src/main.tsx`

บทบาท: bootstrap, configuration หรือ declaration. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

### `src/pages/clone-template-page`

#### `src/pages/clone-template-page/clone-template-page.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `CloneTemplateComponent`, `CloneTemplatePage`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 12 | `CloneTemplateComponent` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 20 | `cloneTemplate` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async () =>` |
| 60 | `CloneTemplatePage` | component | React component แสดง UI และประสาน props/context/event | `() =>` |

### `src/pages/editor-page`

#### `src/pages/editor-page/canvas/area-node/area-node-context-menu.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `AreaNodeContextMenu`, `AreaNodeContextMenuProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 18 | `onEditName` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |
| 21 | `AreaNodeContextMenu` | component | React component แสดง UI และประสาน props/context/event | `({ children, area, onEditName }) =>` |
| 35 | `removeAreaHandler` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |
| 39 | `autoArrangeHandler` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 41 | `areaNode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(n) => n.id === are` |
| 51 | `tablesInArea` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 70 | `pos` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(p) =>` |

#### `src/pages/editor-page/canvas/area-node/area-node-status/area-node-status.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `AreaNodeStatus`, `AreaNodeStatusProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 8 | `AreaNodeStatus` | component | React component แสดง UI และประสาน props/context/event | `({ status }) =>` |

#### `src/pages/editor-page/canvas/area-node/area-node.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `AreaNode`, `AreaNodeType`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 42 | `AreaNode` | component | React component แสดง UI และประสาน props/context/event | `({ selected, dragging, data: { area } }) => {` |
| 67 | `calculateDiff` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 84 | `editAreaName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 92 | `abortEdit` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 97 | `openAreaInEditor` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 114 | `enterEditMode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e: React.MouseEvent) =>` |
| 119 | `containerClassName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

#### `src/pages/editor-page/canvas/canvas-context-menu.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `CanvasContextMenu`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 35 | `CanvasContextMenu` | component | React component แสดง UI และประสาน props/context/event | `({ children, }) =>` |
| 62 | `selectedTableIds` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(state) =>` |
| 69 | `createTableHandler` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {` |
| 79 | `defaultSchemaInList` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(s) => s.name === defaultSc` |
| 106 | `createViewHandler` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {` |
| 116 | `defaultSchemaInList` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(s) => s.name === defaultSc` |
| 144 | `createAreaHandler` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {` |
| 159 | `createNoteHandler` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {` |
| 174 | `createRelationshipHandler` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `() =>` |
| 178 | `autoArrangeHandler` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 188 | `importSqlDbmlHandler` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `() =>` |
| 198 | `moveSelectedToArea` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `( areaId: string, overrideRect?: { x: number; y: number; width: number; height: number; } ) => {` |
| 211 | `areaNode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(n) => n.id === areaId && n` |
| 214 | `areaData` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a) =>` |
| 224 | `existingAreaTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.parentAreaId =` |
| 227 | `movingTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 246 | `pos` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(p) =>` |
| 269 | `createAreaForSelectedHandler` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async () =>` |
| 271 | `firstSelected` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(n) =>` |

#### `src/pages/editor-page/canvas/canvas-filter/canvas-filter.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `CanvasFilter`, `CanvasFilterProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 34 | `onClose` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |
| 37 | `CanvasFilter` | component | React component แสดง UI และประสาน props/context/event | `({ onClose }) =>` |
| 59 | `relevantTableData` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 74 | `databaseWithSchemas` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => database` |
| 80 | `treeData` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 134 | `filteredTreeData` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 143 | `filteredChildren` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(tableNode) =>` |
| 159 | `hasNoTables` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 160 | `totalTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(sum, node) => sum + (node.` |
| 168 | `isDiagramEmpty` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 171 | `handleClearFilter` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 176 | `renderActions` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `(node: TreeNode<NodeType, NodeContext>) => (` |
| 200 | `selectTable` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(tableId: string) => {` |
| 250 | `handleNodeClick` | function | Event handler เชื่อม user/system event กับ state action | `(node: TreeNode<NodeType, NodeContext>) => {` |
| 274 | `openFilterShortcut` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => (getOper` |

#### `src/pages/editor-page/canvas/canvas-filter/filter-item-actions.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `FilterItemActions`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 21 | `toggleSchemaFilter` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(schemaId: string) => void` |
| 22 | `toggleTableFilter` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(tableId: string) => void` |
| 23 | `clearTableIdsFilter` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `() => void` |
| 24 | `setTableIdsFilterEmpty` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `() => void` |
| 25 | `addTablesToFilter` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(attrs: { tableIds?: string[]; filterCallback?: (table: FilterTableInfo) => boolean; }) => void` |
| 27 | `filterCallback` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(table: FilterTableInfo) => boolean` |
| 29 | `removeTablesFromFilter` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(attrs: { tableIds?: string[]; filterCallback?: (table: FilterTableInfo) => boolean; }) => void` |
| 31 | `filterCallback` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(table: FilterTableInfo) => boolean` |
| 35 | `FilterItemActions` | component | React component แสดง UI และประสาน props/context/event | `({ node, databaseWithSchemas, toggleSchemaFilter, toggleTableFilter, clearTableIdsFilter, setTableIdsFilterEmpty, addTablesToFilter, removeTablesFromFilter, }) =>` |
| 87 | `handleZoomToArea` | function | Event handler เชื่อม user/system event กับ state action | `(e: React.MouseEvent) =>` |
| 149 | `handleZoomToTable` | function | Event handler เชื่อม user/system event กับ state action | `(e: React.MouseEvent) =>` |

#### `src/pages/editor-page/canvas/canvas-filter/types.ts`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `AreaContext`, `GroupingMode`, `NodeContext`, `NodeType`, `RelevantTableData`, `SchemaContext`, `TableContext`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/pages/editor-page/canvas/canvas-filter/utils.ts`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `generateTreeDataByAreas`, `generateTreeDataBySchemas`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 18 | `computeTableVisibility` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( tables: RelevantTableData[], filter: DiagramFilter \| undefined, databaseType: DatabaseType ): TableWithVisibility[] =>` |
| 37 | `createTableChildren` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `( tablesWithVisibility: TableWithVisibility[] ): TreeNode<NodeType, NodeContext>[] =>` |
| 53 | `generateTreeDataByAreas` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `({ areas, databaseType, filter, relevantTableData, }: { areas: Area[]; databaseType: DatabaseType; filter?: DiagramFilter; relevantTableData: RelevantTableData[]; }): TreeNode<NodeType, NodeContext>[] =>` |
| 157 | `generateTreeDataBySchemas` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `({ relevantTableData, databaseWithSchemas, databaseType, filter, }: { relevantTableData: RelevantTableData[]; databaseWithSchemas: boolean; databaseType: DatabaseType; filter?: DiagramFilter; }): TreeNode<NodeType, No...` |

#### `src/pages/editor-page/canvas/canvas-utils.ts`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `findOverlappingTables`, `findTableOverlapping`, `getCardinalityMarkerId`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 13 | `getCardinalityMarkerId` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ cardinality, selected, side, }: { cardinality: Cardinality; selected: boolean; side: 'left' \| 'right'; }) =>` |
| 24 | `calcRect` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ node, table, }: ExactlyOne<{ table: DBTable; node: TableNodeType }>) =>` |
| 49 | `findTableOverlapping` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `( { node, table, }: ExactlyOne<{ node: TableNodeType; table: DBTable; }>, { nodes, tables, }: ExactlyOne<{ nodes: TableNodeType[]; tables: DBTable[]; }>, graph: Graph<string> ): Graph<string> =>` |
| 95 | `findOverlappingTables` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `({ tables, nodes, }: ExactlyOne<{ nodes: TableNodeType[]; tables: DBTable[]; }>): Graph<string> =>` |

#### `src/pages/editor-page/canvas/canvas.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `Canvas`, `CanvasProps`, `EdgeType`, `NodeType`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 159 | `tableToTableNode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( table: DBTable, { filter, databaseType, filterLoading, showDBViews, forceShow, isRelationshipCreatingTarget = false, targetEdgeCounts, }: { filter?: DiagramFilter; databaseType: DatabaseType; filterLoading: boolean;...` |
| 212 | `areaToAreaNode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( area: Area, { tables, filter, databaseType, filterLoading, }: { tables: DBTable[]; filter?: DiagramFilter; databaseType: DatabaseType; filterLoading: boolean; } ): AreaNodeType =>` |
| 227 | `tablesInArea` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 257 | `noteToNoteNode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(note: Note): NoteNodeType =>` |
| 276 | `Canvas` | component | React component แสดง UI และประสาน props/context/event | `({ initialTables }) =>` |
| 336 | `shouldForceShowTable` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(tableId: string) => {` |
| 372 | `initialNodes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) =>` |
| 410 | `tableNodeIds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 416 | `timeoutId` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 417 | `targetIndexes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(acc, relationship) => {` |
| 427 | `targetDepIndexes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(acc, dep) => {` |
| 494 | `selectedNodesIds` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(node) =>` |
| 506 | `selectedEdgesIds` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(edge) =>` |
| 525 | `newEdges` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(edge): EdgeType =>` |
| 685 | `updatedNodes` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(node) =>` |
| 747 | `checkParentAreas` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 748 | `visibleTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(node) =>` |
| 751 | `visibleAreas` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(node) =>` |
| 782 | `update` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(u) => u.id === table.id` |
| 801 | `onConnectHandler` | function | Event handler เชื่อม user/system event กับ state action | `async (params: AddEdgeParams) => {` |
| 859 | `onEdgesChangeHandler` | function | Event handler เชื่อม user/system event กับ state action | `(changes) => {` |
| 869 | `removeChanges` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(change) => change.type ===` |
| 873 | `edgesToRemove` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(edge) =>` |
| 877 | `relationshipsToRemove` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(edge) =>` |
| 883 | `dependenciesToRemove` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(edge) =>` |
| 908 | `updateOverlappingGraphOnChanges` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `({ positionChanges, sizeChanges, }: { positionChanges: NodePositionChange[]; sizeChanges: NodeDimensionChange[]; }) => {` |
| 972 | `findRelevantNodesChanges` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(changes: NodeChange<NodeType>[], type: NodeType['type']) => {` |
| 974 | `relevantChanges` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(change) =>` |
| 1000 | `positionChanges` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(change) =>` |
| 1011 | `removeChanges` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(change) => change.type ===` |
| 1015 | `sizeChanges` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(change) => change.type ===` |
| 1028 | `onNodesChangeHandler` | function | Event handler เชื่อม user/system event กับ state action | `(changes) => {` |
| 1039 | `areaDragChanges` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(change) =>` |
| 1052 | `currentArea` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a) => a.id === areaChange.id` |
| 1060 | `childTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) => table.parentAreaId === areaC` |
| 1111 | `currentArea` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a) => a.id === change.id` |
| 1143 | `updatedTables` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(table) =>` |
| 1146 | `removedArea` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(change) =>` |
| 1158 | `positionChange` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(change) => change.id === currentTable.id` |
| 1161 | `sizeChange` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(change) => change.id === currentTable.id` |
| 1338 | `eventConsumer` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(event: ChartDBEvent) => {` |
| 1471 | `hasOverlappingTables` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 1481 | `allTablesHiddenByFilter` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 1496 | `pulseOverlappingTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 1502 | `exitEditTableMode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => setEditT` |
| 1527 | `handleMouseMove` | function | Event handler เชื่อม user/system event กับ state action | `(event: React.MouseEvent) => {` |
| 1559 | `handleEscape` | function | Event handler เชื่อม user/system event กับ state action | `(event: KeyboardEvent) =>` |
| 1584 | `nodesWithCursor` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 1601 | `edgesWithFloating` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 1630 | `onPaneClickHandler` | function | Event handler เชื่อม user/system event กับ state action | `(event: React.MouseEvent<Element, MouseEvent>) => {` |

#### `src/pages/editor-page/canvas/connection-line/connection-line.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `ConnectionLine`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 6 | `ConnectionLine` | component | React component แสดง UI และประสาน props/context/event | `({ fromX, fromY, toX, toY, fromPosition, toPosition }) =>` |

#### `src/pages/editor-page/canvas/create-relationship-node/create-relationship-node.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `CREATE_RELATIONSHIP_NODE_ID`, `CreateRelationshipNode`, `CreateRelationshipNodeType`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 28 | `CreateRelationshipNode` | component | React component แสดง UI และประสาน props/context/event | `({ data }) =>` |
| 43 | `sourceTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => getTable` |
| 47 | `targetTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => getTable` |
| 53 | `sourcePKField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 70 | `targetFieldOptions` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 73 | `compatibleFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(field) =>` |
| 136 | `rafId` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 142 | `handleCreate` | function | Event handler เชื่อม user/system event กับ state action | `async () =>` |

#### `src/pages/editor-page/canvas/dependency-edge/dependency-edge.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `DependencyEdge`, `DependencyEdgeType`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 17 | `DependencyEdge` | component | React component แสดง UI และประสาน props/context/event | `({ id, sourceX, sourceY, targetX, targetY, source, target, selected, // data, }) =>` |
| 32 | `openDependencyInEditor` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 37 | `edgeNumber` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 87 | `minDistanceKey` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(key) => distances[ke` |

#### `src/pages/editor-page/canvas/hooks/use-is-lost-in-canvas.tsx`

บทบาท: React hook สำหรับ logic ใช้ซ้ำ. Exports: `useIsLostInCanvas`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 7 | `useIsLostInCanvas` | function | Hook อ่านหรือควบคุม IsLostInCanvas; ดู implementation สำหรับ dependency และ side effect | `() =>` |
| 12 | `checkVisibleTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 23 | `visibleNodes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(node) =>` |
| 45 | `anyNodeVisible` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(node) =>` |

#### `src/pages/editor-page/canvas/marker-definitions.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `MarkerDefinitions`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 7 | `MarkerDefinitions` | component | React component แสดง UI และประสาน props/context/event | `() =>` |

#### `src/pages/editor-page/canvas/note-node/note-node.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `NoteNode`, `NoteNodeProps`, `NoteNodeType`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 26 | `NoteNode` | component | React component แสดง UI และประสาน props/context/event | `({ data, selected, dragging, }) =>` |
| 41 | `saveContent` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 47 | `abortEdit` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 52 | `enterEditMode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e: React.MouseEvent) => {` |
| 61 | `handleDelete` | function | Event handler เชื่อม user/system event กับ state action | `(e: React.MouseEvent) => {` |
| 69 | `handleColorChange` | function | Event handler เชื่อม user/system event กับ state action | `(color: string) => {` |
| 76 | `handleDoubleClick` | function | Event handler เชื่อม user/system event กับ state action | `(e) => {` |
| 90 | `eventConsumer` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(event: CanvasEvent) => {` |
| 112 | `getHeaderColor` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(color: string) =>` |
| 117 | `getBodyColor` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(color: string) =>` |

#### `src/pages/editor-page/canvas/relationship-edge/edit-relationship-popover.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `EditRelationshipPopover`, `EditRelationshipPopoverProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 15 | `onCardinalityChange` | method | Event handler เชื่อม user/system event กับ state action | `( sourceCardinality: Cardinality, targetCardinality: Cardinality ) => void` |
| 19 | `onSwitch` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |
| 20 | `onDelete` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |
| 34 | `EditRelationshipPopover` | component | React component แสดง UI และประสาน props/context/event | `({ anchorPosition, relationshipId, sourceCardinality, targetCardinality, onCardinalityChange, onSwitch, onDelete, }) =>` |
| 51 | `openRelationshipInSidebar` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

#### `src/pages/editor-page/canvas/relationship-edge/relationship-edge.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `RelationshipEdge`, `RelationshipEdgeType`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 24 | `RelationshipEdge` | component | React component แสดง UI และประสาน props/context/event | `({ id, sourceX, sourceY, targetX, targetY, source, target, selected, data, }) => {` |
| 52 | `isPopoverOpen` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() => editRelationship` |
| 57 | `handleEdgeClick` | function | Event handler เชื่อม user/system event กับ state action | `(e: React.MouseEvent) => {` |
| 71 | `handleContextMenu` | function | Event handler เชื่อม user/system event กับ state action | `(e: React.MouseEvent) => {` |
| 83 | `handleIndicatorClick` | function | Event handler เชื่อม user/system event กับ state action | `(e: React.MouseEvent) => {` |
| 94 | `handleSwitchTables` | function | Event handler เชื่อม user/system event กับ state action | `async () =>` |
| 151 | `handleCardinalityChange` | function | Event handler เชื่อม user/system event กับ state action | `async ( newSourceCardinality: Cardinality, newTargetCardinality: Cardinality ) => {` |
| 195 | `handleDelete` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 200 | `edgeNumber` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 216 | `sourceNode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => getInternalNode(` |
| 220 | `targetNode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => getInternalNode(` |
| 224 | `edge` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 226 | `sourceHandle` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 261 | `minDistanceKey` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(key) =>` |
| 278 | `edgePath` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 315 | `sourceMarker` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 324 | `targetMarker` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 334 | `isDiffNewRelationship` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 344 | `isDiffRelationshipRemoved` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 355 | `edgeMidpoint` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

#### `src/pages/editor-page/canvas/show-all-button.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `ShowAllButton`, `ShowAllButtonProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 9 | `ShowAllButton` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 14 | `timer` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 21 | `showAll` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

#### `src/pages/editor-page/canvas/table-node/table-edit-mode/table-edit-mode-field.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TableEditModeField`, `TableEditModeFieldProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 25 | `TableEditModeField` | component | React component แสดง UI และประสาน props/context/event | `({ table, field, focused = false, databaseType }) => {` |
| 50 | `timer` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

#### `src/pages/editor-page/canvas/table-node/table-edit-mode/table-edit-mode.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TableEditMode`, `TableEditModeProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 34 | `onClose` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |
| 37 | `TableEditMode` | component | React component แสดง UI และประสาน props/context/event | `({ table, color, focusFieldId: focusFieldIdProp, onClose }) => {` |
| 67 | `supportsSchemas` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() => databasesWit` |
| 72 | `defaultSchemaName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => defaultSchem` |
| 77 | `schemaOptions` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 94 | `setFieldRef` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(fieldId: string) =>` |
| 111 | `scrollToFieldId` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(fieldId: string) =>` |
| 130 | `handleWheel` | function | Event handler เชื่อม user/system event กับ state action | `(e: WheelEvent) =>` |
| 153 | `handleAddField` | function | Event handler เชื่อม user/system event กับ state action | `async () =>` |
| 161 | `handleColorChange` | function | Event handler เชื่อม user/system event กับ state action | `(newColor: string) => {` |
| 168 | `handleSchemaChange` | function | Event handler เชื่อม user/system event กับ state action | `(schemaId: string) => {` |
| 170 | `schema` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(s) =>` |
| 179 | `handleCreateNewSchema` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 194 | `handleToggleSchemaMode` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 205 | `openTableInEditor` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

#### `src/pages/editor-page/canvas/table-node/table-edit-mode/table-field-toggle.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TableFieldToggle`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 5 | `TableFieldToggle` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |

#### `src/pages/editor-page/canvas/table-node/table-node-context-menu.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TableNodeContextMenu`, `TableNodeContextMenuProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 35 | `TableNodeContextMenu` | component | React component แสดง UI และประสาน props/context/event | `({ children, table }) =>` |
| 56 | `selectedTableIds` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(state) =>` |
| 64 | `duplicateTableHandler` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) => {` |
| 77 | `editTableHandler` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e) => {` |
| 88 | `removeTableHandler` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(e) => {` |
| 97 | `addRelationshipHandler` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(e) => {` |
| 107 | `moveToArea` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `( areaId: string, tableIds: string[], overrideRect?: { x: number; y: number; width: number; height: number; } ) => {` |
| 121 | `areaNode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(n) => n.id === areaId && n` |
| 124 | `areaData` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(a) =>` |
| 134 | `existingAreaTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) => t.parentAreaId =` |
| 137 | `movingTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(t) =>` |
| 156 | `pos` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(p) =>` |
| 171 | `moveToAreaHandler` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(areaId: string \| null) => {` |
| 199 | `createAreaHandler` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async () =>` |
| 201 | `node` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(n) =>` |

#### `src/pages/editor-page/canvas/table-node/table-node-dependency-indicator.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `BOTTOM_SOURCE_HANDLE_ID_PREFIX`, `TARGET_DEP_PREFIX`, `TOP_SOURCE_HANDLE_ID_PREFIX`, `TableNodeDependencyIndicator`, `TableNodeDependencyIndicatorProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 24 | `TableNodeDependencyIndicator` | component | React component แสดง UI และประสาน props/context/event | `({ table, focused }) =>` |
| 30 | `isTarget` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 43 | `isTargetFromTable` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 59 | `numberOfEdgesToTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

#### `src/pages/editor-page/canvas/table-node/table-node-field.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `LEFT_HANDLE_ID_PREFIX`, `RIGHT_HANDLE_ID_PREFIX`, `TARGET_ID_PREFIX`, `TableNodeField`, `TableNodeFieldProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 55 | `arePropsEqual` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( prevProps: TableNodeFieldProps, nextProps: TableNodeFieldProps ) =>` |
| 82 | `TableNodeField` | component | React component แสดง UI และประสาน props/context/event | `({ field, focused, tableNodeId, highlighted, visible, isConnectable, targetEdgeCount, }) => {` |
| 97 | `isTarget` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 112 | `isTargetFromView` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 130 | `numberOfEdgesToField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 148 | `isForeignKey` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 182 | `frameId` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 238 | `timer` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 306 | `isFieldAttributeChanged` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 320 | `isCustomTypeHighlighted` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 328 | `openEditTableOnField` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

#### `src/pages/editor-page/canvas/table-node/table-node-status/table-node-status.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TableNodeStatus`, `TableNodeStatusProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 8 | `TableNodeStatus` | component | React component แสดง UI และประสาน props/context/event | `({ status }) =>` |

#### `src/pages/editor-page/canvas/table-node/table-node.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TABLE_RELATIONSHIP_SOURCE_HANDLE_ID_PREFIX`, `TABLE_RELATIONSHIP_TARGET_HANDLE_ID_PREFIX`, `TableNode`, `TableNodeType`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 74 | `TableNode` | component | React component แสดง UI และประสาน props/context/event | `({ selected, dragging, id, data: { table, isOverlapping, highlightOverlappingTables, hasHighlightedCustomType, highlightTable, isRelationshipCreatingTarget, targetEdgeCounts, }, }) => {` |
| 90 | `edges` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(store) =>` |
| 108 | `editTableMode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => editTableMod` |
| 112 | `editTableModeFieldId` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => (editTableMo` |
| 123 | `isTarget` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 138 | `fields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 151 | `tableChangedName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => getTableNewN` |
| 156 | `tableChangedColor` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => getTableNewC` |
| 160 | `tableColor` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 182 | `calculateDiff` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 211 | `selectedRelEdges` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `() =>` |
| 227 | `highlightedFieldIds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 242 | `focused` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => (!!selected` |
| 247 | `openTableInEditor` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 252 | `expandTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 261 | `shrinkTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 267 | `toggleExpand` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |
| 275 | `relatedFieldIds` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 284 | `visibleFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 325 | `result` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(field) =>` |
| 338 | `isPartOfCreatingRelationship` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 347 | `tableClassName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 402 | `enterEditTableMode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 416 | `exitEditTableMode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

#### `src/pages/editor-page/canvas/temp-cursor-node/temp-cursor-node.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TEMP_CURSOR_HANDLE_ID`, `TEMP_CURSOR_NODE_ID`, `TempCursorNode`, `TempCursorNodeType`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 14 | `TempCursorNode` | component | React component แสดง UI และประสาน props/context/event | `() =>` |

#### `src/pages/editor-page/canvas/temp-floating-edge/temp-floating-edge.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TEMP_FLOATING_EDGE_ID`, `TempFloatingEdge`, `TempFloatingEdgeType`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 14 | `TempFloatingEdge` | component | React component แสดง UI และประสาน props/context/event | `({ id, sourceX, sourceY, targetX, targetY, sourcePosition = Position.Right, targetPosition = Position.Left, }) => {` |

#### `src/pages/editor-page/canvas/toolbar/toolbar-button.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `ToolbarButton`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 6 | `ToolbarButton` | component | React component แสดง UI และประสาน props/context/event | `(props, ref) =>` |

#### `src/pages/editor-page/canvas/toolbar/toolbar.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `Toolbar`, `ToolbarProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 30 | `convertToPercentage` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `(value: number) =>` |
| 36 | `Toolbar` | component | React component แสดง UI และประสาน props/context/event | `({ readonly }) =>` |
| 45 | `toggleFilter` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |
| 56 | `zoomInHandler` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 60 | `zoomOutHandler` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 64 | `resetZoom` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |
| 72 | `showAll` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 80 | `showReorderConfirmation` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

#### `src/pages/editor-page/editor-desktop-layout.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `EditorDesktopLayout`, `EditorDesktopLayoutProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 19 | `EditorDesktopLayout` | component | React component แสดง UI และประสาน props/context/event | `({ initialDiagram, }) =>` |

#### `src/pages/editor-page/editor-mobile-layout.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `EditorMobileLayout`, `EditorMobileLayoutProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 21 | `EditorMobileLayout` | component | React component แสดง UI และประสาน props/context/event | `({ initialDiagram, }) =>` |

#### `src/pages/editor-page/editor-page.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `EditorDesktopLayoutLazy`, `EditorMobileLayoutLazy`, `EditorPage`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 33 | `EditorDesktopLayoutLazy` | component | React component แสดง UI และประสาน props/context/event | `() => impo` |
| 37 | `EditorMobileLayoutLazy` | component | React component แสดง UI และประสาน props/context/event | `() => impo` |
| 41 | `EditorPageComponent` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 114 | `EditorPage` | component | React component แสดง UI และประสาน props/context/event | `() =>` |

#### `src/pages/editor-page/editor-sidebar/editor-sidebar.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `EditorSidebar`, `EditorSidebarProps`, `SidebarItem`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 37 | `onClick` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |
| 44 | `EditorSidebar` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 57 | `diagramItems` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => [` |
| 79 | `baseItems` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => [` |
| 142 | `footerItems` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => [` |

#### `src/pages/editor-page/side-panel/custom-types-section/custom-type-list/custom-type-list-item/custom-type-list-item-content/composite-fields/composite-field.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `CompositeField`, `CompositeFieldProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 11 | `onRemove` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |
| 14 | `CompositeField` | component | React component แสดง UI และประสาน props/context/event | `({ field, onRemove }) =>` |
| 16 | `onRemove` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |

#### `src/pages/editor-page/side-panel/custom-types-section/custom-type-list/custom-type-list-item/custom-type-list-item-content/composite-fields/composite-fields.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `CustomTypeCompositeFields`, `CustomTypeCompositeFieldsProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 37 | `addField` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(value: DBCustomTypeField) => void` |
| 38 | `removeField` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(value: DBCustomTypeField) => void` |
| 39 | `reorderFields` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(fields: DBCustomTypeField[]) => void` |
| 42 | `CustomTypeCompositeFields` | component | React component แสดง UI และประสาน props/context/event | `({ fields, addField, removeField, reorderFields }) =>` |
| 50 | `dataTypes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => dataType` |
| 55 | `customDataTypes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 66 | `handleDragEnd` | function | Event handler เชื่อม user/system event กับ state action | `(event: DragEndEvent) => {` |
| 71 | `oldIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(field) => field.field === acti` |
| 74 | `newIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(field) => field.field === over` |
| 91 | `handleAddField` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 94 | `fieldExists` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(field) => field.field ===` |
| 110 | `handleKeyDown` | function | Event handler เชื่อม user/system event กับ state action | `(e: React.KeyboardEvent) => {` |
| 120 | `handleRemoveField` | function | Event handler เชื่อม user/system event กับ state action | `(field: DBCustomTypeField) => {` |

#### `src/pages/editor-page/side-panel/custom-types-section/custom-type-list/custom-type-list-item/custom-type-list-item-content/custom-type-list-item-content.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `CustomTypeListItemContent`, `CustomTypeListItemContentProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 35 | `CustomTypeListItemContent` | component | React component แสดง UI และประสาน props/context/event | `({ customType }) =>` |
| 48 | `deleteCustomTypeHandler` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |
| 52 | `updateCustomTypeKind` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(kind: DBCustomTypeKind) => {` |
| 61 | `addEnumValue` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(value: string) => {` |
| 70 | `removeEnumValue` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(value: string) => {` |
| 79 | `addCompositeField` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(field: DBCustomTypeField) => {` |
| 88 | `removeCompositeField` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(field: DBCustomTypeField) => {` |
| 99 | `reorderCompositeFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(fields: DBCustomTypeField[]) => {` |
| 108 | `toggleHighlightCustomType` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |
| 116 | `canHighlight` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() => checkIfC` |
| 121 | `isHighlighted` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() => highligh` |
| 126 | `renderHighlightButton` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() => (` |

#### `src/pages/editor-page/side-panel/custom-types-section/custom-type-list/custom-type-list-item/custom-type-list-item-content/enum-values/enum-values.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `CustomTypeEnumValues`, `EnumValuesProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 10 | `addValue` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(value: string) => void` |
| 11 | `removeValue` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(value: string) => void` |
| 14 | `CustomTypeEnumValues` | component | React component แสดง UI และประสาน props/context/event | `({ values, addValue, removeValue, }) =>` |
| 23 | `handleAddValue` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 30 | `handleKeyDown` | function | Event handler เชื่อม user/system event กับ state action | `(e: React.KeyboardEvent) => {` |

#### `src/pages/editor-page/side-panel/custom-types-section/custom-type-list/custom-type-list-item/custom-type-list-item-header/custom-type-list-item-header.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `CustomTypeListItemHeader`, `CustomTypeListItemHeaderProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 44 | `CustomTypeListItemHeader` | component | React component แสดง UI และประสาน props/context/event | `({ customType }) =>` |
| 63 | `editCustomTypeName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 72 | `abortEdit` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 81 | `enterEditMode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e: React.MouseEvent) =>` |
| 86 | `deleteCustomTypeHandler` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {` |
| 95 | `isHighlighted` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() => highligh` |
| 100 | `toggleHighlightCustomType` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {` |
| 113 | `canHighlight` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() => checkIfC` |
| 118 | `renderDropDownMenu` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() =>` |
| 170 | `schemaToDisplay` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

#### `src/pages/editor-page/side-panel/custom-types-section/custom-type-list/custom-type-list-item/custom-type-list-item.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `CustomTypeListItem`, `CustomTypeListItemProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 17 | `CustomTypeListItem` | component | React component แสดง UI และประสาน props/context/event | `({ customType }, ref) =>` |

#### `src/pages/editor-page/side-panel/custom-types-section/custom-type-list/custom-type-list-item/utils.ts`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `checkIfCustomTypeUsed`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 3 | `checkIfCustomTypeUsed` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `({ customType, tables, }: { customType: DBCustomType; tables: DBTable[]; }): boolean =>` |

#### `src/pages/editor-page/side-panel/custom-types-section/custom-type-list/custom-type-list.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `CustomTypeList`, `CustomTypeProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 25 | `CustomTypeList` | component | React component แสดง UI และประสาน props/context/event | `({ customTypes }) =>` |
| 31 | `refs` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 43 | `scrollToCustomType` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(id: string) =>` |
| 54 | `handleDragEnd` | function | Event handler เชื่อม user/system event กับ state action | `(event: DragEndEvent) => {` |
| 59 | `oldIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(customType) => customType.id === ac` |
| 62 | `newIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(customType) => customType.id === ov` |
| 80 | `handleScrollToCustomType` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |

#### `src/pages/editor-page/side-panel/custom-types-section/custom-types-section.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `CustomTypesSection`, `CustomTypesSectionProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 13 | `CustomTypesSection` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 19 | `filteredCustomTypes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 27 | `handleClearFilter` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 31 | `handleCreateCustomType` | function | Event handler เชื่อม user/system event กับ state action | `async () =>` |

#### `src/pages/editor-page/side-panel/dbml-section/dbml-section.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `DBMLSection`, `DBMLSectionProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 6 | `DBMLSection` | component | React component แสดง UI และประสาน props/context/event | `() =>` |

#### `src/pages/editor-page/side-panel/dbml-section/table-dbml/table-dbml.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TableDBML`, `TableDBMLProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 45 | `getEditorTheme` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(theme: EffectiveTheme) =>` |
| 49 | `TableDBML` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 68 | `handleEditorDidMount` | function | Event handler เชื่อม user/system event กับ state action | `( editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: Monaco ) => {` |
| 81 | `readOnlyDisposable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 110 | `dbmlToDisplay` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => (dbmlFor` |
| 116 | `toggleFormat` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |
| 178 | `generateDBML` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async () =>` |
| 209 | `showDiff` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async (dbmlContent: string) => {` |
| 284 | `acceptChanges` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async () =>` |
| 306 | `undoChanges` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

#### `src/pages/editor-page/side-panel/list-item-header-button/list-item-header-button.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `ListItemHeaderButton`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 5 | `ListItemHeaderButton` | component | React component แสดง UI และประสาน props/context/event | `(props, ref) =>` |

#### `src/pages/editor-page/side-panel/refs-section/refs-list/dependency-list-item/dependency-list-item-content/dependency-list-item-content.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `DependencyListItemContent`, `DependencyListItemContentProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 18 | `DependencyListItemContent` | component | React component แสดง UI และประสาน props/context/event | `({ dependency }) =>` |
| 28 | `deleteDependencyHandler` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |

#### `src/pages/editor-page/side-panel/refs-section/refs-list/dependency-list-item/dependency-list-item-header/dependency-list-item-header.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `DependencyListItemHeader`, `DependencyListItemHeaderProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 24 | `DependencyListItemHeader` | component | React component แสดง UI และประสาน props/context/event | `({ dependency }) =>` |
| 33 | `dependencyName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 45 | `focusOnDependency` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {` |
| 90 | `deleteDependencyHandler` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |
| 97 | `renderDropDownMenu` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() => (` |

#### `src/pages/editor-page/side-panel/refs-section/refs-list/dependency-list-item/dependency-list-item.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `DependencyListItem`, `DependencyListItemProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 15 | `DependencyListItem` | component | React component แสดง UI และประสาน props/context/event | `({ dependency }, ref) =>` |

#### `src/pages/editor-page/side-panel/refs-section/refs-list/refs-list.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `RefsList`, `RefsListProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 14 | `RefsList` | component | React component แสดง UI และประสาน props/context/event | `({ refs }) =>` |
| 19 | `itemRefs` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(acc, ref) => {` |
| 27 | `scrollToRef` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(id: string) =>` |
| 36 | `handleScrollToRef` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 46 | `numberOfRelationships` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => refs.fil` |
| 51 | `relationshipsTitle` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 59 | `numberOfDependencies` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => refs.fil` |
| 64 | `dependenciesTitle` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

#### `src/pages/editor-page/side-panel/refs-section/refs-list/relationship-list-item/relationship-list-item-content/relationship-list-item-content.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `RelationshipListItemContent`, `RelationshipListItemContentProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 36 | `RelationshipListItemContent` | component | React component แสดง UI และประสาน props/context/event | `({ relationship }) =>` |
| 48 | `relationshipType` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 57 | `updateCardinalities` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(type: RelationshipType) => {` |
| 76 | `handleSwitchTables` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 123 | `deleteRelationshipHandler` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |

#### `src/pages/editor-page/side-panel/refs-section/refs-list/relationship-list-item/relationship-list-item-header/relationship-list-item-header.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `RelationshipListItemHeader`, `RelationshipListItemHeaderProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 31 | `RelationshipListItemHeader` | component | React component แสดง UI และประสาน props/context/event | `({ relationship }) =>` |
| 44 | `editRelationshipName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 64 | `enterEditMode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `( event: React.MouseEvent<HTMLButtonElement, MouseEvent> ) =>` |
| 71 | `handleFocusOnRelationship` | function | Event handler เชื่อม user/system event กับ state action | `(event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {` |
| 88 | `deleteRelationshipHandler` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |
| 95 | `renderDropDownMenu` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() => (` |

#### `src/pages/editor-page/side-panel/refs-section/refs-list/relationship-list-item/relationship-list-item.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `RelationshipListItem`, `RelationshipListItemProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 15 | `RelationshipListItem` | component | React component แสดง UI และประสาน props/context/event | `({ relationship }, ref) =>` |

#### `src/pages/editor-page/side-panel/refs-section/refs-section.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `Ref`, `RefType`, `RefsSection`, `RefsSectionProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 38 | `RefsSection` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 49 | `allRefs` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(): Ref[] =>` |
| 50 | `relationshipRefs` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(rel) =>` |
| 73 | `filteredRefs` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 74 | `filterName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(ref: Ref): boolean =>` |
| 97 | `filterByDiagram` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(ref: Ref): boolean =>` |
| 161 | `handleCreateRelationship` | function | Event handler เชื่อม user/system event กับ state action | `async () =>` |

#### `src/pages/editor-page/side-panel/side-panel.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `SidePanel`, `SidePanelProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 24 | `SidePanel` | component | React component แสดง UI และประสาน props/context/event | `() =>` |

#### `src/pages/editor-page/side-panel/tables-section/table-list/table-list-item/table-list-item-content/table-check-constraint/table-check-constraint.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TableCheckConstraint`, `TableCheckConstraintProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 19 | `updateConstraint` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(attrs: Partial<DBCheckConstraint>) => void` |
| 20 | `removeConstraint` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `() => void` |
| 23 | `TableCheckConstraint` | component | React component แสดง UI และประสาน props/context/event | `({ constraint, updateConstraint, removeConstraint, }) =>` |
| 32 | `validationResult` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

#### `src/pages/editor-page/side-panel/tables-section/table-list/table-list-item/table-list-item-content/table-field/table-field-modal/table-field-modal.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TableFieldPopover`, `TableFieldPopoverProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 40 | `updateField` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(attrs: Partial<DBField>) => void` |
| 41 | `removeField` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `() => void` |
| 43 | `onOpenChange` | method | Event handler เชื่อม user/system event กับ state action | `(open: boolean) => void` |
| 46 | `TableFieldPopover` | component | React component แสดง UI และประสาน props/context/event | `({ field, table, databaseType, updateField, removeField, open: controlledOpen, onOpenChange: controlledOnOpenChange, }) =>` |
| 60 | `isOpen` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() => controll` |
| 64 | `setIsOpen` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(open: boolean) => {` |
| 76 | `isOnlyPrimaryKey` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |
| 92 | `updateFieldStable` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(attrs: Partial<DBField>) => {` |
| 119 | `dataFieldType` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => findData` |
| 124 | `supportsAutoIncrement` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() => supports` |
| 129 | `supportsArray` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() => supports` |
| 135 | `forceAutoIncrement` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() => autoIncr` |
| 141 | `isIncrementDisabled` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() => localFie` |

#### `src/pages/editor-page/side-panel/tables-section/table-list/table-list-item/table-list-item-content/table-field/table-field-toggle.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TableFieldToggle`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 5 | `TableFieldToggle` | component | React component แสดง UI และประสาน props/context/event | `({ className, ...props }, ref) =>` |

#### `src/pages/editor-page/side-panel/tables-section/table-list/table-list-item/table-list-item-content/table-field/table-field.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TableField`, `TableFieldProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 23 | `updateField` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(attrs: Partial<DBField>) => void` |
| 24 | `removeField` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `() => void` |
| 29 | `TableField` | component | React component แสดง UI และประสาน props/context/event | `({ table, field, updateField, removeField, databaseType, readonly = false, }) =>` |
| 62 | `handleCommentIndicatorClick` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |

#### `src/pages/editor-page/side-panel/tables-section/table-list/table-list-item/table-list-item-content/table-index/index-type-selector.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `IndexTypeSelector`, `IndexTypeSelectorProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 22 | `onChange` | method | Event handler เชื่อม user/system event กับ state action | `(value: IndexType) => void` |
| 24 | `t` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `(key: string) => string` |
| 27 | `IndexTypeSelector` | component | React component แสดง UI และประสาน props/context/event | `({ options, value, label, onChange, readonly, t, }) =>` |
| 73 | `onSelect` | method | Event handler เชื่อม user/system event กับ state action | `() => void` |
| 76 | `IndexTypeOption` | component | React component แสดง UI และประสาน props/context/event | `({ option, isSelected, onSelect, }) =>` |

#### `src/pages/editor-page/side-panel/tables-section/table-list/table-list-item/table-list-item-content/table-index/table-index-toggle.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TableIndexToggle`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 4 | `TableIndexToggle` | component | React component แสดง UI และประสาน props/context/event | `(props, ref) =>` |

#### `src/pages/editor-page/side-panel/tables-section/table-list/table-list-item/table-list-item-content/table-index/table-index.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TableIndex`, `TableIndexProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 35 | `updateIndex` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `(attrs: Partial<DBIndex>) => void` |
| 36 | `removeIndex` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `() => void` |
| 40 | `TableIndex` | component | React component แสดง UI และประสาน props/context/event | `({ fields, index, updateIndex, removeIndex, }) =>` |
| 49 | `fieldOptions` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 58 | `selectedFields` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `() => fields.f` |
| 63 | `canUseGin` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() => canField` |
| 70 | `indexTypeOptions` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 81 | `updateIndexFields` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(fieldIds: string \| string[]) => {` |
| 92 | `newSelectedFields` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) =>` |
| 105 | `updateIndexType` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `(newType: IndexType) => {` |

#### `src/pages/editor-page/side-panel/tables-section/table-list/table-list-item/table-list-item-content/table-list-item-content.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TableListItemContent`, `TableListItemContentProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 48 | `TableListItemContent` | component | React component แสดง UI และประสาน props/context/event | `({ table, }) =>` |
| 73 | `handleFieldUpdate` | function | Event handler เชื่อม user/system event กับ state action | `(fieldId: string, attrs: Partial<DBField>) => {` |
| 79 | `remainingPrimaryKeys` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(f) => f.id !== fieldId &&` |
| 98 | `handleDragEnd` | function | Event handler เชื่อม user/system event กับ state action | `(event: DragEndEvent) =>` |
| 103 | `oldIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(item) =>` |
| 104 | `newIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(item) =>` |
| 112 | `createIndexHandler` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {` |
| 128 | `createFieldHandler` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {` |
| 136 | `createCheckConstraintHandler` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {` |

#### `src/pages/editor-page/side-panel/tables-section/table-list/table-list-item/table-list-item-header/table-list-item-header.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TableListItemHeader`, `TableListItemHeaderProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 46 | `TableListItemHeader` | component | React component แสดง UI และประสาน props/context/event | `({ table, }) =>` |
| 69 | `editTableName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 78 | `abortEdit` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 87 | `enterEditMode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e: React.MouseEvent) =>` |
| 92 | `handleFocusOnTable` | function | Event handler เชื่อม user/system event กับ state action | `(event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {` |
| 100 | `deleteTableHandler` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `() =>` |
| 104 | `updateTableSchema` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `({ schema }: { schema: DBSchema }) => {` |
| 117 | `changeSchema` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 126 | `duplicateTableHandler` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {` |
| 140 | `renderDropDownMenu` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() => (` |
| 243 | `schemaToDisplay` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

#### `src/pages/editor-page/side-panel/tables-section/table-list/table-list-item/table-list-item.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TableListItem`, `TableListItemProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 17 | `TableListItem` | component | React component แสดง UI และประสาน props/context/event | `({ table }, ref) =>` |

#### `src/pages/editor-page/side-panel/tables-section/table-list/table-list.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TableList`, `TableListProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 25 | `TableList` | component | React component แสดง UI และประสาน props/context/event | `({ tables }) =>` |
| 30 | `refs` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 42 | `scrollToTable` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(id: string) =>` |
| 53 | `handleDragEnd` | function | Event handler เชื่อม user/system event กับ state action | `(event: DragEndEvent) =>` |
| 57 | `oldIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) => table.id === act` |
| 60 | `newIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) =>` |
| 62 | `tablesOrders` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(acc, table, index) =>` |
| 80 | `handleScrollToTable` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |

#### `src/pages/editor-page/side-panel/tables-section/tables-section.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TablesSection`, `TablesSectionProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 23 | `TablesSection` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 37 | `tablesFilteredByDiagram` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 50 | `allTablesHiddenByDiagramFilter` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 58 | `filteredTables` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 59 | `filterTableName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) =>` |
| 63 | `filterViews` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(table) =>` |
| 71 | `getCenterLocation` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `() =>` |
| 79 | `createTableWithLocation` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async ({ schema }: { schema?: DBSchema }) => {` |
| 92 | `createViewWithLocation` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async ({ schema }: { schema?: DBSchema }) => {` |
| 106 | `handleCreateTable` | function | Event handler เชื่อม user/system event กับ state action | `async ({ view }: { view?: boolean }) => {` |
| 139 | `handleClearFilter` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |

#### `src/pages/editor-page/side-panel/visuals-section/areas-tab/areas-list/area-list-item/area-list-item.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `AreaListItem`, `AreaListItemProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 40 | `AreaListItem` | component | React component แสดง UI และประสาน props/context/event | `({ area }, forwardedRef) => {` |
| 62 | `saveAreaName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 70 | `abortEdit` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 75 | `enterEditMode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(e: React.MouseEvent) =>` |
| 80 | `handleDelete` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 84 | `handleColorChange` | function | Event handler เชื่อม user/system event กับ state action | `(color: string) => {` |
| 91 | `handleFocusOnArea` | function | Event handler เชื่อม user/system event กับ state action | `(event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {` |
| 103 | `renderDropDownMenu` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() => (` |

#### `src/pages/editor-page/side-panel/visuals-section/areas-tab/areas-list/areas-list.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `AreaList`, `AreaListProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 24 | `AreaList` | component | React component แสดง UI และประสาน props/context/event | `({ areas }) =>` |
| 29 | `refs` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 41 | `scrollToArea` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(id: string) =>` |
| 52 | `handleDragEnd` | function | Event handler เชื่อม user/system event กับ state action | `(event: DragEndEvent) =>` |
| 56 | `oldIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(area) =>` |
| 57 | `newIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(area) =>` |
| 67 | `handleScrollToArea` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |

#### `src/pages/editor-page/side-panel/visuals-section/areas-tab/areas-tab.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `AreasTab`, `AreasTabProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 16 | `AreasTab` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 24 | `filteredAreas` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 25 | `filterAreaName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(area) =>` |
| 32 | `createAreaWithLocation` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async () =>` |
| 51 | `handleCreateArea` | function | Event handler เชื่อม user/system event กับ state action | `async () =>` |
| 56 | `handleClearFilter` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |

#### `src/pages/editor-page/side-panel/visuals-section/notes-tab/notes-list/note-list-item/note-list-item.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `NoteListItem`, `NoteListItemProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 31 | `NoteListItem` | component | React component แสดง UI และประสาน props/context/event | `({ note }, forwardedRef) => {` |
| 50 | `handleDelete` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 54 | `handleColorChange` | function | Event handler เชื่อม user/system event กับ state action | `(color: string) => {` |
| 61 | `handleFocusOnNote` | function | Event handler เชื่อม user/system event กับ state action | `(event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {` |
| 69 | `renderDropDownMenu` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() => (` |

#### `src/pages/editor-page/side-panel/visuals-section/notes-tab/notes-list/notes-list.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `NotesList`, `NotesListProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 24 | `NotesList` | component | React component แสดง UI และประสาน props/context/event | `({ notes }) =>` |
| 29 | `refs` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 41 | `scrollToNote` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(id: string) =>` |
| 52 | `handleDragEnd` | function | Event handler เชื่อม user/system event กับ state action | `(event: DragEndEvent) =>` |
| 56 | `oldIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(note) =>` |
| 57 | `newIndex` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(note) =>` |
| 67 | `handleScrollToNote` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |

#### `src/pages/editor-page/side-panel/visuals-section/notes-tab/notes-tab.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `NotesTab`, `NotesTabProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 16 | `NotesTab` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 24 | `filteredNotes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 25 | `filterNoteContent` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(note) =>` |
| 32 | `createNoteWithLocation` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `async () =>` |
| 51 | `handleCreateNote` | function | Event handler เชื่อม user/system event กับ state action | `async () =>` |
| 56 | `handleClearFilter` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |

#### `src/pages/editor-page/side-panel/visuals-section/visuals-section.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `VisualsSection`, `VisualsSectionProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 18 | `VisualsSection` | component | React component แสดง UI และประสาน props/context/event | `() =>` |

#### `src/pages/editor-page/top-navbar/diagram-name.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `DiagramName`, `DiagramNameProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 20 | `DiagramName` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 34 | `editDiagramName` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 49 | `timeoutId` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 60 | `enterEditMode` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(event: React.MouseEvent<HTMLElement, MouseEvent>) => {` |

#### `src/pages/editor-page/top-navbar/language-nav/language-nav.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `LanguageNav`, `LanguageNavProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 25 | `LanguageNav` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 29 | `languagesOptions` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(lang) =>` |
| 35 | `handleLanguageChange` | function | Event handler เชื่อม user/system event กับ state action | `(language: string \| string[]) => {` |
| 43 | `language` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

#### `src/pages/editor-page/top-navbar/last-saved.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `LastSaved`, `LastSavedProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 17 | `timeAgolocaleFromLanguage` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async ( language: string ): Promise<{ locale: LocaleFunc; lang: string }> =>` |
| 75 | `LastSaved` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 81 | `updateLocale` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async () =>` |

#### `src/pages/editor-page/top-navbar/menu/menu.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `Menu`, `MenuProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 34 | `Menu` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 70 | `handleDeleteDiagramAction` | function | Event handler เชื่อม user/system event กับ state action | `() =>` |
| 75 | `createNewDiagram` | function | สร้าง domain value, identifier, output หรือ UI structure ใหม่ | `() =>` |
| 79 | `openDiagram` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 83 | `exportSVG` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() =>` |
| 91 | `exportPNG` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() =>` |
| 97 | `exportJPG` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() =>` |
| 103 | `openChartDBDocs` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 107 | `openJoinDiscord` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 111 | `exportSQL` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `(databaseType: DatabaseType) => {` |
| 128 | `showOrHideSidePanel` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 136 | `showOrHideCardinality` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 140 | `showOrHideFieldAttributes` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |
| 144 | `showOrHideMiniMap` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `() =>` |

#### `src/pages/editor-page/top-navbar/top-navbar-mobile.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TopNavbarMobile`, `TopNavbarMobileProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 12 | `TopNavbarMobile` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 13 | `renderStars` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() =>` |

#### `src/pages/editor-page/top-navbar/top-navbar-mock.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TopNavbarMock`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 7 | `TopNavbarMock` | component | React component แสดง UI และประสาน props/context/event | `() =>` |

#### `src/pages/editor-page/top-navbar/top-navbar.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TopNavbar`, `TopNavbarProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 12 | `TopNavbar` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 15 | `renderStars` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() =>` |

#### `src/pages/editor-page/use-diagram-loader.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `useDiagramLoader`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 11 | `useDiagramLoader` | function | Hook อ่านหรือควบคุม DiagramLoader; ดู implementation สำหรับ dependency และ side effect | `() =>` |
| 33 | `loadDefaultDiagram` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async () =>` |

### `src/pages/examples-page`

#### `src/pages/examples-page/example-card.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `ExampleCard`, `ExampleCardProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 21 | `utilizeExample` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `() => void` |
| 25 | `ExampleCard` | component | React component แสดง UI และประสาน props/context/event | `({ example, utilizeExample, loading, }) =>` |

#### `src/pages/examples-page/examples-data/examples-data.ts`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `Example`, `examples`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/pages/examples-page/examples-page.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `ExamplesPage`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 16 | `ExamplesPageComponent` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 21 | `utilizeExample` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `async ({ example }: { example: Example }) => {` |
| 109 | `ExamplesPage` | component | React component แสดง UI และประสาน props/context/event | `() =>` |

### `src/pages/not-found-page`

#### `src/pages/not-found-page/not-found-page.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `NotFoundPage`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 3 | `NotFoundPage` | component | React component แสดง UI และประสาน props/context/event | `() =>` |

### `src/pages/template-page`

#### `src/pages/template-page/template-page.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TemplatePage`, `TemplatePageLoaderData`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 41 | `TemplatePageComponent` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 56 | `cloneTemplate` | function | เปลี่ยน state หรือ domain data ตามชื่อ function | `async () =>` |
| 307 | `TemplatePage` | component | React component แสดง UI และประสาน props/context/event | `() =>` |

### `src/pages/templates-page`

#### `src/pages/templates-page/template-card/template-card.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TemplateCard`, `TemplateCardProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 20 | `TemplateCard` | component | React component แสดง UI และประสาน props/context/event | `({ template }) =>` |

#### `src/pages/templates-page/templates-page-helmet.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TemplatesPageHelmet`, `TemplatesPageHelmetProps`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 12 | `TemplatesPageHelmet` | component | React component แสดง UI และประสาน props/context/event | `({ tag, isFeatured, }) =>` |
| 18 | `formattedUrlTag` | function | สร้าง representation สำหรับแสดงผลหรือส่งออก | `() => tag?.toL` |
| 23 | `canonicalUrl` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `() =>` |

#### `src/pages/templates-page/templates-page.tsx`

บทบาท: หน้า application และ UI เฉพาะหน้า. Exports: `TemplatesPage`, `TemplatesPageLoaderData`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 20 | `TemplatesPageComponent` | component | React component แสดง UI และประสาน props/context/event | `() =>` |
| 27 | `isFeatured` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(match) => match.id` |
| 30 | `isAllTemplates` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(match) =>` |
| 31 | `tag` | function | Function เฉพาะโมดูล; พฤติกรรมหลักตามชื่อและ signature | `(currentTag) =>` |
| 147 | `TemplatesPage` | component | React component แสดง UI และประสาน props/context/event | `() =>` |

### `src/polyfills.ts`

#### `src/polyfills.ts`

บทบาท: bootstrap, configuration หรือ declaration. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

### `src/router.tsx`

#### `src/router.tsx`

บทบาท: bootstrap, configuration หรือ declaration. Exports: `router`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 11 | `lazy` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `async lazy() {` |
| 22 | `lazy` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `async lazy() {` |
| 33 | `lazy` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `async lazy() {` |
| 53 | `lazy` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `async lazy() {` |
| 74 | `lazy` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `async lazy() {` |
| 95 | `lazy` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `async lazy() {` |
| 115 | `lazy` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `async lazy() {` |
| 134 | `lazy` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `async lazy() {` |

### `src/safari-compat.ts`

#### `src/safari-compat.ts`

บทบาท: bootstrap, configuration หรือ declaration. Exports: `getIsOldSafari`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 8 | `isSafari` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(): boolean =>` |
| 27 | `hasRemarkGfmRegexIssue` | function | ตรวจเงื่อนไขหรือความถูกต้องแล้วคืนผลตรวจ | `(): boolean =>` |
| 43 | `getIsOldSafari` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `(): boolean =>` |

### `src/templates-data/template-utils.ts`

#### `src/templates-data/template-utils.ts`

บทบาท: bootstrap, configuration หรือ declaration. Exports: `convertTemplateToNewDiagram`, `getTemplatesAndAllTags`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 6 | `convertTemplateToNewDiagram` | function | แปลง input ให้อยู่ในรูปแบบที่ระบบใช้ | `(template: Template): Diagram =>` |
| 18 | `getTemplatesAndAllTags` | function | ค้นหา คำนวณ หรือคืนค่าจาก input โดยไม่เป็น UI | `async ({ featured, tag, }: { featured?: boolean; tag?: string; } = {}): Promise<{ templates: Template[]; tags: string[] }> =>` |

### `src/templates-data/templates-data.ts`

#### `src/templates-data/templates-data.ts`

บทบาท: bootstrap, configuration หรือ declaration. Exports: `Template`, `templates`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

### `src/templates-data/templates`

#### `src/templates-data/templates/adonis-acl-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `adonisAclDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/airbnb-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `airbnbDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/akaunting-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `akauntingDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/attendize-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `attendizeDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/bookstack-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `bookstackDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/bouncer-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `bouncerDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/buddypress-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `buddypressDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/cabot-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `cabotDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/cachet-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `cachetDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/canvas-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `canvasDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/comfortable-mexican-sofa-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `comfortableMexicanSofaDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/deployer-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `deployerDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/devise-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `deviseDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/django-axes-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `djangoAxesDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/django-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `djangoDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/doorkeeper-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `doorkeeperDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/employee-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `employeeDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/feedbin-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `feedbinDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/flarum-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `flarumDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/flipper-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `flipperDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/freescout-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `freescoutDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/gravity-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `gravityDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/hacker-news-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `hackerNewsDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/koel-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `koelDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/laravel-activitylog-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `laravelActivitylogDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/laravel-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `laravelDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/laravel-permission-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `laravelPermissionDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/laravel-spark-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `laravelSparkDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/lobsters-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `lobstersDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/monica-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `monicaDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/octobox-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `octoboxDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/orchid-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `orchidDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/pay-rails-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `payRailsDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/pixelfed-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `pixelfedDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/pokemon-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `pokemonDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/polr-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `polrDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/refinerycms-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `refinerycmsDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/reversion-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `reversionDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/saas-pegasus-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `saasPegasusDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/screeenly-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `screeenlyDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/snipe-it-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `snipeItDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/staytus-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `staytusDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/sylius-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `syliusDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/taggit-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `taggitDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/talk-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `talkDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/ticketit-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `ticketitDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/twitter-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `twitterDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/visual-novel-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `visualNovelDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/voyager-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `voyagerDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

#### `src/templates-data/templates/wordpress-db.ts`

บทบาท: ข้อมูล schema ตัวอย่างสำเร็จรูป. Exports: `wordpressDb`.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

### `src/test/setup.ts`

#### `src/test/setup.ts`

บทบาท: bootstrap, configuration หรือ declaration. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

### `src/types.d.ts`

#### `src/types.d.ts`

บทบาท: bootstrap, configuration หรือ declaration. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

### `src/types/dbml-parse.d.ts`

#### `src/types/dbml-parse.d.ts`

บทบาท: bootstrap, configuration หรือ declaration. Exports: `Compiler`, `DBMLCompletionItemProvider`, `services`.

| บรรทัด | Symbol | ชนิด | หน้าที่ | Signature |
|---:|---|---|---|---|
| 16 | `setSource` | method | เปลี่ยน state หรือ domain data ตามชื่อ function | `setSource(source: string): void;` |
| 27 | `provideCompletionItems` | method | Method ของ class/object contract; พฤติกรรมตามชื่อและ signature | `provideCompletionItems( model: editor.ITextModel, position: { lineNumber: number; column: number } ): languages.CompletionList;` |

### `src/vite-env.d.ts`

#### `src/vite-env.d.ts`

บทบาท: bootstrap, configuration หรือ declaration. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

### `src/window.d.ts`

#### `src/window.d.ts`

บทบาท: bootstrap, configuration หรือ declaration. ไม่มี named export.

ไม่มี named function/component/method; ไฟล์เป็น data, type, constant หรือ side-effect declaration.

## ขอบเขตและการ regenerate

เอกสาร function reference เน้น named callables ซึ่งค้นหาและอ้างอิงได้. JSX callbacks, array callbacks, test callbacks และ event lambdas แบบ anonymous อยู่ใต้ function/component เจ้าของ ไม่แยกชื่อ. Regenerate หลัง source เปลี่ยนด้วย:

```bash
node scripts/generate-project-documentation.mjs
```
