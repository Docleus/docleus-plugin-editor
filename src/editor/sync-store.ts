// `@tiptap/react` imports the `use-sync-external-store` shims, which are
// CommonJS and `require("react")` at runtime. React comes from the host
// import map, so the build aliases the shims to this module instead.
import { useMemo, useRef, useSyncExternalStore } from "react";

export { useSyncExternalStore };

interface Memo<Snapshot, Selection> {
  readonly snapshot: Snapshot;
  readonly selection: Selection;
}

/** `use-sync-external-store/with-selector` on React's built-in hook. */
export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
  subscribe: (onChange: () => void) => () => void,
  getSnapshot: () => Snapshot,
  getServerSnapshot: undefined | null | (() => Snapshot),
  selector: (snapshot: Snapshot) => Selection,
  isEqual?: (a: Selection, b: Selection) => boolean,
): Selection {
  const last = useRef<Memo<Snapshot, Selection> | undefined>(undefined);
  const [select, selectServer] = useMemo(() => {
    const memoized = (snapshot: Snapshot): Selection => {
      const previous = last.current;
      if (previous && Object.is(previous.snapshot, snapshot)) {
        return previous.selection;
      }
      const next = selector(snapshot);
      const selection =
        previous && isEqual?.(previous.selection, next)
          ? previous.selection
          : next;
      last.current = { snapshot, selection };
      return selection;
    };
    return [
      () => memoized(getSnapshot()),
      getServerSnapshot ? () => memoized(getServerSnapshot()) : undefined,
    ];
  }, [getSnapshot, getServerSnapshot, selector, isEqual]);
  return useSyncExternalStore(subscribe, select, selectServer);
}
