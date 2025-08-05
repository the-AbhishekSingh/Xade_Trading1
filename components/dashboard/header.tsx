'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  LineChart, 
  Wallet, 
  History, 
  Settings, 
  HelpCircle,
  Bell, // Add this import
  User,
  Moon,
  Sun,
  ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { getCurrentUser } from '@/lib/auth';

const navItems = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    name: 'Trading',
    href: '/dashboard/trading',
    icon: <LineChart className="h-5 w-5" />,
  },
  {
    name: 'Wallet',
    href: '/dashboard/wallet',
    icon: <Wallet className="h-5 w-5" />,
  },
  {
    name: 'History',
    href: '/dashboard/history',
    icon: <History className="h-5 w-5" />,
  },
  {
    name: 'Settings',
    href: '/dashboard/settings',
    icon: <Settings className="h-5 w-5" />,
  },
  {
    name: 'Help',
    href: '/dashboard/help',
    icon: <HelpCircle className="h-5 w-5" />,
  },
];

export function DashboardHeader() {
  const [balance, setBalance] = useState<number>(0);
  const [selectedPlan, setSelectedPlan] = useState<string>('');

  useEffect(() => {
    const fetchBalance = async () => {
      // First try to get balance from localStorage (demo mode)
      const demoBalance = localStorage.getItem('demoBalance');
      const userBalance = localStorage.getItem('userBalance');
      const selectedBalance = localStorage.getItem('selectedBalance');
      
      if (demoBalance) {
        setBalance(Number(demoBalance));
      } else if (userBalance) {
        setBalance(Number(userBalance));
      } else if (selectedBalance) {
        setBalance(Number(selectedBalance));
      } else {
        // Fallback to database if no localStorage balance
        const walletAddress = localStorage.getItem('walletAddress');
        if (walletAddress) {
          try {
            const user = await getCurrentUser(walletAddress);
            if (user && user.current_balance !== undefined) {
              setBalance(user.current_balance);
            }
          } catch (error) {
            console.error('Error fetching balance from database:', error);
            // Set a default demo balance if database fails
            setBalance(10000);
          }
        }
      }
    };
    
    // Get selected plan from localStorage
    const plan = localStorage.getItem('selectedPlan');
    if (plan) {
      setSelectedPlan(plan);
    }
    
    fetchBalance();
    // Optionally, poll for balance updates every 10 seconds
    const interval = setInterval(fetchBalance, 10000);
    return () => clearInterval(interval);
  }, []);
  
  return (
    <header className="w-full bg-black border-b border-neutral-800 h-16 flex items-center px-8">
      {/* Logo */}
      <div className="text-white text-2xl font-bold tracking-widest mr-12">AlphaTrade</div>
      {/* Navigation */}
      <nav className="flex items-center space-x-8 text-white text-base font-medium">
        <a href="#" className="hover:text-green-400">Trade</a>
        <a href="#" className="hover:text-green-400">Docs</a>
        <a href="#" className="hover:text-green-400">Leaderboard</a>
        <a href="#" className="hover:text-green-400">Campaigns</a>
        <a href="#" className="hover:text-green-400">Community</a>
        <a href="#" className="hover:text-green-400">Mobile App</a>
        <a href="#" className="hover:text-green-400">Add Funds</a>
        </nav>
      {/* Spacer */}
      <div className="flex-1" />
      {/* Demo Plan and Balance Display */}
      <div className="flex items-center space-x-4 text-white">
        {selectedPlan && (
          <div className="text-sm text-green-400 font-medium">
            {selectedPlan} Demo
          </div>
        )}
        <div className="font-semibold rounded px-6 py-2">Balance: ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      </div>
    </header>
  );
}