import React from 'react';
import { Home, Car, Laptop, CreditCard, User, GraduationCap, ShoppingBag, Users, Briefcase } from 'lucide-react';
import { LoanCategory } from '../types';

export interface CategoryMeta {
  key: LoanCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}

export const CATEGORIES: Record<LoanCategory, CategoryMeta> = {
  home: {
    key: 'home',
    label: 'Home Loan',
    icon: Home,
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/10 border-sky-500/20',
  },
  vehicle: {
    key: 'vehicle',
    label: 'Auto / Vehicle',
    icon: Car,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10 border-amber-500/20',
  },
  gadget: {
    key: 'gadget',
    label: 'Gadgets & Tech',
    icon: Laptop,
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10 border-violet-500/20',
  },
  credit_card: {
    key: 'credit_card',
    label: 'Card EMI / Loan',
    icon: CreditCard,
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/10 border-rose-500/20',
  },
  personal: {
    key: 'personal',
    label: 'Personal Loan',
    icon: User,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10 border-emerald-500/20',
  },
  education: {
    key: 'education',
    label: 'Education Loan',
    icon: GraduationCap,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10 border-indigo-500/20',
  },
  bnpl: {
    key: 'bnpl',
    label: 'BNPL / Pay Later',
    icon: ShoppingBag,
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/10 border-teal-500/20',
  },
  peer: {
    key: 'peer',
    label: 'Peer / Family',
    icon: Users,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10 border-orange-500/20',
  },
  business: {
    key: 'business',
    label: 'Business / SME',
    icon: Briefcase,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10 border-cyan-500/20',
  },
};
