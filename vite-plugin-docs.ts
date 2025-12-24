import { Plugin } from 'vite';
import { Project, SyntaxKind } from 'ts-morph';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';

interface DocParam {
	name: string;
	type: string;
	description: string;
	optional: boolean;
	defaultValue?: string;
}

interface DocEntry {
	name: string;
	kind: 'interface' | 'function' | 'type' | 'const';
	description: string;
	params?: DocParam[];
	returnType?: string;
	properties?: DocParam[];
	remarks?: string;
	example?: string;
	exported: boolean;
}

const SOURCE_FILES = ['src/lib/workerTypes.ts', 'src/lib/worker.ts'];

const OUTPUT_PATH = 'src/lib/docs/api.json';

function extractDocs(rootDir: string): DocEntry[] {
	const tsConfigPath = resolve(rootDir, 'tsconfig.json');

	const project = new Project({
		tsConfigFilePath: existsSync(tsConfigPath) ? tsConfigPath : undefined,
		skipAddingFilesFromTsConfig: true
	});

	// Add source files explicitly
	for (const filePath of SOURCE_FILES) {
		const absolutePath = resolve(rootDir, filePath);
		if (existsSync(absolutePath)) {
			project.addSourceFileAtPath(absolutePath);
		}
	}

	const docs: DocEntry[] = [];

	for (const filePath of SOURCE_FILES) {
		const absolutePath = resolve(rootDir, filePath);
		const sourceFile = project.getSourceFile(absolutePath);
		if (!sourceFile) continue;

		// Extract interfaces
		for (const iface of sourceFile.getInterfaces()) {
			const jsDocs = iface.getJsDocs();
			const jsDoc = jsDocs[0];

			const entry: DocEntry = {
				name: iface.getName(),
				kind: 'interface',
				description: jsDoc?.getDescription()?.trim() ?? '',
				remarks: jsDoc
					?.getTags()
					.find((t) => t.getTagName() === 'remarks')
					?.getCommentText()
					?.trim(),
				properties: [],
				exported: iface.isExported()
			};

			for (const prop of iface.getProperties()) {
				const propJsDocs = prop.getJsDocs();
				const propJsDoc = propJsDocs[0];

				entry.properties!.push({
					name: prop.getName(),
					type: prop.getType().getText(prop),
					description: propJsDoc?.getDescription()?.trim() ?? '',
					optional: prop.hasQuestionToken(),
					defaultValue: propJsDoc
						?.getTags()
						.find((t) => t.getTagName() === 'defaultValue')
						?.getCommentText()
						?.trim()
				});
			}

			docs.push(entry);
		}

		// Extract functions
		for (const func of sourceFile.getFunctions()) {
			const jsDocs = func.getJsDocs();
			const jsDoc = jsDocs[0];

			const entry: DocEntry = {
				name: func.getName() ?? 'anonymous',
				kind: 'function',
				description: jsDoc?.getDescription()?.trim() ?? '',
				remarks: jsDoc
					?.getTags()
					.find((t) => t.getTagName() === 'remarks')
					?.getCommentText()
					?.trim(),
				returnType: func.getReturnType().getText(func),
				params: [],
				exported: func.isExported()
			};

			const paramTags = jsDoc?.getTags().filter((t) => t.getTagName() === 'param') ?? [];

			for (const param of func.getParameters()) {
				const paramTag = paramTags.find((t) => t.getCommentText()?.startsWith(param.getName()));

				entry.params!.push({
					name: param.getName(),
					type: param.getType().getText(param),
					description:
						paramTag?.getCommentText()?.replace(param.getName(), '').replace(/^[\s-]+/, '') ?? '',
					optional: param.isOptional()
				});
			}

			docs.push(entry);
		}

		// Extract type aliases
		for (const typeAlias of sourceFile.getTypeAliases()) {
			const jsDocs = typeAlias.getJsDocs();
			const jsDoc = jsDocs[0];

			docs.push({
				name: typeAlias.getName(),
				kind: 'type',
				description: jsDoc?.getDescription()?.trim() ?? '',
				exported: typeAlias.isExported()
			});
		}
	}

	return docs;
}

function writeDocs(rootDir: string, docs: DocEntry[]) {
	const outputPath = resolve(rootDir, OUTPUT_PATH);
	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, JSON.stringify(docs, null, 2));
	console.log(`📚 Docs updated: ${docs.length} entries`);
}

export function docsPlugin(): Plugin {
	let rootDir: string;

	return {
		name: 'vite-plugin-docs',

		configResolved(config) {
			rootDir = config.root;
		},

		// Extract on server start and build
		buildStart() {
			try {
				const docs = extractDocs(rootDir);
				writeDocs(rootDir, docs);
			} catch (error) {
				console.error('📚 Error extracting docs:', error);
			}
		},

		// Watch source files and re-extract on change
		configureServer(server) {
			for (const filePath of SOURCE_FILES) {
				server.watcher.add(resolve(rootDir, filePath));
			}

			server.watcher.on('change', (file) => {
				const isSourceFile = SOURCE_FILES.some((src) => file.endsWith(src.replace('src/', '')));

				if (isSourceFile) {
					console.log(`📝 Source changed: ${file}`);
					try {
						const docs = extractDocs(rootDir);
						writeDocs(rootDir, docs);

						// Trigger HMR by sending full reload
						server.ws.send({ type: 'full-reload' });
					} catch (error) {
						console.error('📚 Error extracting docs:', error);
					}
				}
			});
		}
	};
}

