export function workspaceView(state) {
  return {
    connection: state.account ? 'Account connected' : state.online ? 'Riot sign-in required' : 'Connect your PC',
    accountAction: state.account || state.online ? 'REFRESH ACCOUNT ↻' : 'CONNECT MY PC ↗',
    emptyTitle: !state.libraryLoaded ? 'Your profiles are one connection away.' : 'Save your first configuration.',
    emptyDescription: !state.libraryLoaded ? 'Connect the Windows companion to load the profiles stored on this PC.' : state.account ? 'Keep a copy of your current settings, ready to apply whenever you need it.' : 'Your library is empty. Sign in to Riot Client, then refresh your account to save a configuration.',
    emptyAction: state.account ? '+ SAVE CURRENT SETTINGS' : state.online ? 'REFRESH ACCOUNT ↻' : 'CONNECT MY PC ↗',
    canApply: !state.busy && !!state.account && !state.gameRunning,
    canSave: !state.busy && !!state.account,
    canDelete: !state.busy && state.online
  };
}
