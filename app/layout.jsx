import './globals.css';
import Providers from '../components/Providers';
import ClientLayout from '../components/ClientLayout';
import StyledComponentsRegistry from '../lib/registry';

export const metadata = {
  title: 'Smart Park',
  description: 'Smart Park Ticketing and Management System',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body>
        <StyledComponentsRegistry>
          <Providers>
            <ClientLayout>
              {children}
            </ClientLayout>
          </Providers>
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
