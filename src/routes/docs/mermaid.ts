/** Mermaid diagrams for the docs pages, coloured to match the app's two themes. */

const FONT_FAMILY =
	"-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', 'Segoe UI', Roboto, sans-serif";

const lightThemeVariables = {
	fontFamily: FONT_FAMILY,
	primaryColor: '#ffffff',
	primaryTextColor: '#1d1d1f',
	primaryBorderColor: '#d2d2d7',
	lineColor: '#86868b',
	secondaryColor: '#f5f5f7',
	tertiaryColor: '#f5f5f7',
	background: '#ffffff',
	mainBkg: '#ffffff',
	nodeBorder: '#d2d2d7',
	clusterBkg: '#f5f5f7',
	clusterBorder: '#e8e8ed',
	titleColor: '#1d1d1f',
	edgeLabelBackground: '#ffffff',
	actorBkg: '#ffffff',
	actorBorder: '#d2d2d7',
	actorTextColor: '#1d1d1f',
	actorLineColor: '#d2d2d7',
	signalColor: '#515154',
	signalTextColor: '#1d1d1f',
	labelBoxBkgColor: '#f5f5f7',
	labelBoxBorderColor: '#d2d2d7',
	labelTextColor: '#1d1d1f',
	loopTextColor: '#515154',
	noteBkgColor: '#e5f1fc',
	noteBorderColor: '#e5f1fc',
	noteTextColor: '#1d1d1f',
	activationBkgColor: '#e8e8ed',
	activationBorderColor: '#d2d2d7'
};

const darkThemeVariables: typeof lightThemeVariables = {
	fontFamily: FONT_FAMILY,
	primaryColor: '#2c2c2e',
	primaryTextColor: '#f5f5f7',
	primaryBorderColor: '#48484a',
	lineColor: '#8e8e93',
	secondaryColor: '#1c1c1e',
	tertiaryColor: '#1c1c1e',
	background: '#1c1c1e',
	mainBkg: '#2c2c2e',
	nodeBorder: '#48484a',
	clusterBkg: '#232325',
	clusterBorder: '#38383a',
	titleColor: '#f5f5f7',
	edgeLabelBackground: '#1c1c1e',
	actorBkg: '#2c2c2e',
	actorBorder: '#48484a',
	actorTextColor: '#f5f5f7',
	actorLineColor: '#48484a',
	signalColor: '#a1a1a6',
	signalTextColor: '#f5f5f7',
	labelBoxBkgColor: '#2c2c2e',
	labelBoxBorderColor: '#48484a',
	labelTextColor: '#f5f5f7',
	loopTextColor: '#a1a1a6',
	noteBkgColor: '#12304f',
	noteBorderColor: '#12304f',
	noteTextColor: '#f5f5f7',
	activationBkgColor: '#3a3a3c',
	activationBorderColor: '#48484a'
};

let mermaidModule: typeof import('mermaid') | undefined;
// Renders are serialized: mermaid keeps global state while it runs
let queue: Promise<void> = Promise.resolve();

/**
 * Render every `.mermaid` element on the page for the given theme.
 * Safe to call again when the theme changes: each diagram's source is kept and re-rendered.
 */
export function renderDiagrams(isDark: boolean): Promise<void> {
	queue = queue.then(() => render(isDark)).catch((error) => console.error(error));
	return queue;
}

async function render(isDark: boolean) {
	mermaidModule ??= await import('mermaid');
	const mermaid = mermaidModule.default;

	for (const element of Array.from(document.querySelectorAll<HTMLElement>('.mermaid'))) {
		// Rendering replaces the source with the SVG, so keep a copy to render from next time
		if (element.dataset.source === undefined) {
			element.dataset.source = element.textContent ?? '';
		} else {
			element.textContent = element.dataset.source;
			element.removeAttribute('data-processed');
		}
	}

	mermaid.initialize({
		startOnLoad: false,
		theme: 'base',
		themeVariables: isDark ? darkThemeVariables : lightThemeVariables,
		flowchart: { curve: 'basis', padding: 20 }
	});
	await mermaid.run({ querySelector: '.mermaid' });
}
