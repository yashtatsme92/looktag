import { createRouter } from "@tanstack/react-router";
import { NotFoundScreen } from "@/components/errors/not-found-screen";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    defaultNotFoundComponent: NotFoundScreen,
    scrollRestoration: true,
  });
}
