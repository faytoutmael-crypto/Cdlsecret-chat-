import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AuthFlow from "@/pages/auth-flow";
import Chat from "@/pages/chat";
import AccountCreation from "@/pages/account-creation";
import CodeVerification from "@/pages/code-verification";
import CodeAccess from "@/pages/code-access";
import Login from "@/pages/login";
import Register from "@/pages/register";
import { AuthProvider } from "@/hooks/use-auth";

function Router() {
  return (
    <Switch>
      <Route path="/" component={AccountCreation} />
      <Route path="/account-creation" component={AccountCreation} />
      <Route path="/code-verification" component={CodeVerification} />
      <Route path="/code-access" component={CodeAccess} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/auth-flow" component={AuthFlow} />
      <Route path="/chat" component={Chat} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
