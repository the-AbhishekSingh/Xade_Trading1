'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function SimpleWalletLoginButton({ 
  variant = "default", 
  size = "default"
}: { 
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link",
  size?: "default" | "sm" | "lg" | "icon"
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleConnectWallet = async () => {
    setIsLoading(true);
    
    try {
      // Generate a mock wallet address for demo purposes
      const mockWalletAddress = '0x' + Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
      
      // Store wallet address in localStorage
      localStorage.setItem('walletAddress', mockWalletAddress);
      localStorage.setItem('isAuthenticated', 'true');
      
      // Redirect to pricing page to choose demo balance
      router.push('/pricing');
    } catch (error) {
      console.error('Wallet connection error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button 
      variant={variant} 
      size={size}
      disabled={isLoading}
      onClick={handleConnectWallet}
    >
      <Wallet className="mr-2 h-4 w-4" />
      {isLoading ? 'Connecting...' : 'Connect Wallet'}
    </Button>
  );
} 