# Membership & Credits Hub

## Overview

This project is a standalone, full-stack membership and billing platform designed to manage users, authentication, 2FA, wallets/credits, funding sources, auto-topups, and app subscriptions. Its core purpose is to provide Single Sign-On (SSO) authentication, manage credit balance checks, and handle billing/debits across integrated applications. It serves as a foundational platform for other applications to plug into for user and billing management.

## User Preferences

- Design follows Stripe-inspired minimal aesthetic
- Inter font family for typography
- Blue primary color scheme
- Subtle shadows and borders for card elements

## System Architecture

The platform is built with a clear separation between frontend and backend.

### UI/UX Decisions
The user interface adheres to a Stripe-inspired minimal aesthetic, using the Inter font family for typography and a blue primary color scheme. Design elements incorporate subtle shadows and borders for card components, ensuring a clean and modern look. It supports dark/light themes and is designed to be responsive across devices.

### Technical Implementations
- **Authentication**: JWT-based authentication with access/refresh tokens, supporting Two-Factor Authentication (TOTP and SMS via Plivo).
- **Wallet Management**: Manages user credit balances, transaction history, multiple payment methods, and auto-topup rules.
- **App Integration**: Features an app registry with SSO capabilities (OAuth2/OpenID Connect + PKCE), allowing external applications to integrate for user authentication and credit operations.
- **API Keys**: Supports both user-level API keys for programmatic access and app-level API keys for B2B integrations.
- **Admin Panel**: Role-based administration for managing users, apps, platform statistics, and referral program settings.
- **Auto-Topup System**: Automatically funds user wallets when balances fall below a configured threshold, triggered by external debits.
- **Audit Logging**: Comprehensive logging for financial transactions and authentication events, viewable by both users and administrators.
- **Webhook Event System**: Handles payment status updates and other events with retry logic and status tracking.
- **Background Job Processor**: Manages scheduled operations like auto-topup checks, webhook retries, and subscription billing.
- **Subscription Billing System**: Supports recurring billing for app subscriptions with various cycles (monthly, yearly, per-use) and manages subscription statuses.
- **SMS 2FA System**: Implements phone number verification and SMS-based 2FA using Plivo, with security features like E.164 formatting, rate limiting, and OTP expiration.
- **Referral System**: User referral program with unique shareable codes, welcome bonuses for new users, referrer rewards when referred users fund above threshold, and admin-configurable settings (qualification threshold, bonus amounts, expiration days).

### Feature Specifications
- JWT-based authentication with access/refresh tokens.
- Two-Factor Authentication (TOTP and SMS).
- Wallet management with transaction history and multiple payment methods.
- Auto-topup rules.
- App registry with SSO capabilities (OAuth2/OpenID Connect).
- API key generation for users and apps.
- Role-based admin panel.
- Dark/Light theme support and responsive design.
- Referral program with shareable codes and configurable rewards.

### System Design Choices
- **Backend**: Node.js with TypeScript, Express for HTTP API, Drizzle ORM with PostgreSQL. Utilizes JWT for auth, bcrypt for password hashing, and Zod for validation.
- **Frontend**: React with Vite, TypeScript, TanStack Query for data fetching, Shadcn UI components, Tailwind CSS for styling, and Wouter for routing.
- **Database**: PostgreSQL, with Drizzle ORM for schema management.

## External Dependencies

- **Database**: PostgreSQL (Neon-backed).
- **SMS Gateway**: Plivo (for SMS 2FA).
- **UI Components**: Shadcn UI.
- **Styling**: Tailwind CSS.
- **Data Fetching**: TanStack Query (React Query).
- **Libraries**:
    - `speakeasy` for TOTP 2FA.
    - `qrcode` for 2FA QR code generation.
    - `bcrypt` for password hashing.
    - `zod` for request validation.
- **OAuth2/OpenID Connect**: Standard-compliant implementation for SSO.
- **Third-Party Services (Optional/Future Integration)**:
    - Stripe (currently simulated, can be enabled with credentials).