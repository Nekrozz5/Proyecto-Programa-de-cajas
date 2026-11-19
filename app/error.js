'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RefreshCw, ShoppingCart } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ErrorBoundary({ error, reset }) {
  useEffect(() => {
    console.error('[App Error Boundary]:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-muted/20">
      <Card className="w-full max-w-md shadow-lg border-destructive/20">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="size-6" />
          </div>
          <CardTitle className="text-xl font-bold text-foreground">
            Ha ocurrido un error inesperado
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-1">
            {error?.message || 'Se produjo una falla en la ejecución de la aplicación.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-xs text-muted-foreground">
          Si el problema persiste, intente recargar la página o volver al punto de venta.
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <Button
            variant="default"
            onClick={() => reset()}
            className="w-full sm:w-auto"
          >
            <RefreshCw className="size-4 mr-1.5" />
            Reintentar
          </Button>
          <Button
            asChild
            variant="outline"
            className="w-full sm:w-auto"
          >
            <Link href="/caja">
              <ShoppingCart className="size-4 mr-1.5" />
              Ir al Punto de Venta
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
