export declare const payloadCache: import("unstorage").Storage<import("unstorage").StorageValue> | null;
export declare const islandCache: import("unstorage").Storage<import("unstorage").StorageValue> | null;
export declare const islandPropCache: import("unstorage").Storage<import("unstorage").StorageValue> | null;
export declare const sharedPrerenderPromises: Map<string, Promise<any>> | null;
export declare const sharedPrerenderCache: {
    get<T = unknown>(key: string): Promise<T> | undefined;
    set<T>(key: string, value: Promise<T>): Promise<void>;
} | null;
