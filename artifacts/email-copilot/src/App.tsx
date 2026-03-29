import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import NotFound from "@/pages/not-found";
import Inbox from "@/pages/Inbox";
import EmailDetail from "@/pages/EmailDetail";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});

function AuthHandler() {
  const { toast } = useToast();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    if (auth === "success") {
      toast({ title: "Gmail connected!", description: "Your inbox is now syncing." });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (auth === "error") {
      toast({ title: "Connection failed", description: "Could not connect Gmail. Please try again.", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Inbox} />
      <Route path="/email/:id" component={EmailDetail} />
      <Route path="/sent"><Redirect to="/" /></Route>
      <Route path="/archive"><Redirect to="/" /></Route>
      <Route path="/trash"><Redirect to="/" /></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthHandler />
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
