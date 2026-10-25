// TypeScript declaration for ionicons web components in React 18+ JSX
import 'react';

declare module 'react' {
    namespace JSX {
        interface IntrinsicElements {
            'ion-icon': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
                name?: string;
                src?: string;
                size?: 'small' | 'large';
            };
        }
    }
}
