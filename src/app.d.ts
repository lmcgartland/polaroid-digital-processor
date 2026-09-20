// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

declare global {
	interface Window {
		cv: any;
		// File System Access API (not yet in TypeScript's DOM lib)
		showDirectoryPicker(options?: {
			mode?: 'read' | 'readwrite';
		}): Promise<FileSystemDirectoryHandle>;
	}

	interface FileSystemHandle {
		requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
	}
}

export { };
