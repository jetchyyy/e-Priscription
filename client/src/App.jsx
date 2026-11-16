import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Providers } from './app/providers';
import { router } from './app/router';
import { startSplashWatch } from './pwa/splash';

export default function App() {
  // After the first commit: any PageLoader is mounted by now and holding the launch splash.
  useEffect(() => { startSplashWatch(); }, []);

  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  );
}
