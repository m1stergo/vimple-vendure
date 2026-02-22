import { defineDashboardExtension } from '@vendure/dashboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PuzzleIcon } from 'lucide-react';

function PythonHelloPage() {
    const [isLoading, setIsLoading] = useState(true);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);

    const appUrl = useMemo(() => {
        return import.meta.env.VITE_PYTHON_HELLO_URL || 'http://localhost:5000/hello';
    }, []);

    const appOrigin = useMemo(() => {
        try {
            return new URL(appUrl).origin;
        } catch {
            return '';
        }
    }, [appUrl]);

    useEffect(() => {
        const iframe = iframeRef.current;

        if (!iframe || !appOrigin) {
            return;
        }

        const handleLoad = () => {
            setIsLoading(false);

            iframe.contentWindow?.postMessage(
                {
                    type: 'dashboard:ready',
                    payload: {
                        appId: 'com.example.python-hello',
                        vendureApiUrl: `${window.location.origin}/admin-api`,
                        theme: 'light',
                        locale: 'es',
                    },
                },
                appOrigin,
            );
        };

        iframe.addEventListener('load', handleLoad);

        return () => {
            iframe.removeEventListener('load', handleLoad);
        };
    }, [appOrigin]);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.origin !== appOrigin) {
                return;
            }

            const { type, payload } = event.data || {};
            if (type === 'extension:action' && payload?.action === 'notify') {
                alert(payload.message);
            }
        };

        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [appOrigin]);

    return (
        <div
            style={{
                width: '100%',
                height: 'calc(100vh - 60px)',
                position: 'relative',
                background: '#f5f5f5',
            }}
        >
            {isLoading && (
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center',
                    }}
                >
                    <div
                        style={{
                            width: '40px',
                            height: '40px',
                            border: '4px solid #e0e0e0',
                            borderTop: '4px solid #2196F3',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            margin: '0 auto 1rem',
                        }}
                    />
                    <p style={{ color: '#666' }}>Cargando Python Hello App...</p>
                    <style>{`
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    `}</style>
                </div>
            )}

            <iframe
                id="python-hello-iframe"
                ref={iframeRef}
                src={appUrl}
                style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    display: isLoading ? 'none' : 'block',
                }}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                title="Python Hello App"
            />
        </div>
    );
}

export default defineDashboardExtension({
    navSections: [
        {
            id: 'apps',
            title: 'Apps',
            icon: PuzzleIcon,
            placement: 'top',
            order: 5,
        },
    ],
    routes: [
        {
            path: '/python-hello',
            component: () => <PythonHelloPage />,
            navMenuItem: {
                id: 'python-hello-app',
                sectionId: 'apps',
                title: 'Python Hello',
                order: 10,
            },
        },
    ],
});
