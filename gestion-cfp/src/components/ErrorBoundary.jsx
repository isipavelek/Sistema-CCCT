import React from 'react';

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    
    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught error:', error, errorInfo);
    }
    
    render() {
        if (this.state.hasError) {
            return (
                <div style={{padding: '20px', color: 'red', background: '#ffebee', borderRadius: '8px', margin: '20px'}}>
                    <h1 style={{fontSize: '24px', fontWeight: 'bold'}}>Ha ocurrido un error en este componente:</h1>
                    <pre style={{marginTop: '10px', fontSize: '12px', overflowX: 'auto', background: '#ffcdd2', padding: '10px'}}>
                        {String(this.state.error.stack || this.state.error)}
                    </pre>
                </div>
            );
        }
        return this.props.children;
    }
}
