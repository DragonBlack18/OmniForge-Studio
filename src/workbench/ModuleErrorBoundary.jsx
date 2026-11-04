import React from 'react';

/**
 * Isolates React render/lifecycle and lazy-import failures per tool.
 * It cannot intercept event-handler exceptions, IPC failures or a renderer
 * process crash. Never automatically reload: an unsaved editor/CAD buffer
 * could otherwise be discarded without the user's knowledge.
 */
export default class ModuleErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    // No stack, user input, workspace path or error message in telemetry.
    console.error('[OmniForge] Falha isolada de interface', {
      module: this.props.label,
      type: typeof error?.name === 'string' ? error.name.slice(0, 40) : 'Error'
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="module-error" role="alert" data-testid="module-error-boundary">
        <span className="module-error__eyebrow">RECUPERAÇÃO DE INTERFACE</span>
        <h2>{this.props.label || 'Ferramenta'} temporariamente indisponível</h2>
        <p>
          Ocorreu uma falha de apresentação neste módulo. Os arquivos já salvos
          não foram apagados por este mecanismo. Alterações ainda não salvas
          podem não estar disponíveis após reabrir a ferramenta.
        </p>
        <button type="button" className="button button--outline"
          onClick={() => this.setState({ failed: false })}>
          Tentar reabrir ferramenta
        </button>
      </section>
    );
  }
}
