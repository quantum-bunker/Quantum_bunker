import { Component, ErrorInfo, ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean };

// React requires a class for error boundaries — there is no hook equivalent for
// getDerivedStateFromError/componentDidCatch. This is the sole sanctioned
// class component in the app. It deliberately reports NOTHING anywhere: no
// telemetry, no remote logging, no error text shown to the user — surfacing a
// stack could leak decrypted content held in component state, which the
// zero-knowledge invariant forbids. It only swaps a crashed tree for a static
// recovery panel.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Intentionally empty: no logging by design.
  }

  private reload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="max-w-sm text-sm opacity-70">
          The vault hit an unexpected error and stopped rendering. Your session
          lives only in this tab — reloading starts fresh.
        </p>
        <button
          onClick={this.reload}
          className="rounded-md border border-current px-4 py-2 text-sm"
        >
          Reload
        </button>
      </div>
    );
  }
}
