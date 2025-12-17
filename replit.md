# Notion Order Dashboard

## Overview

This is a Node.js web application that provides an order management dashboard connected to Notion databases. The system manages orders, inventory stocktaking, funds tracking, and team member assignments for what appears to be an educational institution or school system. The application features a multi-step order creation process, user authentication with role-based access control, and comprehensive order tracking from request to fulfillment.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Static File Serving**: Express.js serves static HTML, CSS, and JavaScript files from the `public` directory
- **Client-Side JavaScript**: Modular JavaScript architecture with separate files for each major feature (orders, stocktaking, funds, login)
- **UI Framework**: Custom CSS with responsive design, uses Feather Icons for iconography and Choices.js for enhanced select dropdowns
- **Session-Based State Management**: Uses browser localStorage and sessionStorage for caching user preferences and temporary data

### Backend Architecture
- **Express.js Server**: Simple Node.js backend with Express.js handling HTTP requests and serving static files
- **Session Management**: Express-session middleware for user authentication and session persistence
- **RESTful API Design**: API endpoints follow REST conventions for data operations (GET, POST, etc.)
- **Middleware Stack**: JSON parsing, URL encoding, static file serving, and session management

### Authentication & Authorization
- **Session-Based Authentication**: Users log in with username/password, sessions stored server-side
- **Role-Based Access Control**: Different user roles have access to different pages/features based on allowed pages configuration
- **Page-Level Security**: Frontend dynamically shows/hides navigation elements based on user permissions

### Data Architecture
- **Notion as Database**: Uses Notion API client to interact with multiple Notion databases as the primary data store
- **Multiple Database Schema**: 
  - Products/Components Database: Product catalog and inventory
  - Orders Database: Current orders and order history
  - Products List Database: Order line items and requested products
  - Team Members Database: User accounts and team management
  - Stocktaking Database: Inventory tracking and stock levels
  - Funds Database: Financial tracking and expense management

### Key Features
- **Multi-Step Order Creation**: Three-step process (Details → Products → Review) with draft persistence
- **Order Management**: Separate views for current orders, requested orders, and assigned orders
- **Inventory Tracking**: Stocktaking module with quantity management and categorization
- **Financial Management**: Funds tracking for mission expenses with multiple expense types
- **PDF Generation**: Server-side PDF creation using PDFKit for reports and documents
- **Search & Filtering**: Client-side search functionality across orders, products, and inventory

## External Dependencies

### Core Framework Dependencies
- **@notionhq/client (^2.3.0)**: Official Notion API client for database operations and content management
- **express (^4.21.2)**: Web server framework for handling HTTP requests and middleware
- **express-session (^1.18.2)**: Session management middleware for user authentication
- **pdfkit (^0.17.2)**: PDF document generation library for creating reports and printable documents

### Frontend Libraries (CDN)
- **Feather Icons**: Icon library loaded via CDN for consistent UI iconography
- **Choices.js**: Enhanced select dropdown library for improved user experience with searchable selects

### Environment Configuration
- **Notion API Integration**: Requires `Notion_API_Key` environment variable for API authentication
- **Database IDs**: Multiple Notion database IDs configured via environment variables:
  - `Products_Database`: Product catalog
  - `Products_list`: Order items
  - `Team_Members`: User management
  - `School_Stocktaking_DB_ID`: Inventory tracking
  - `Funds`: Financial records
- **Session Security**: `SESSION_SECRET` environment variable for session encryption

### Hosting Platform
- **Replit Integration**: Configured for Replit hosting with environment variables managed through Replit Secrets
- **Port Configuration**: Uses `process.env.PORT` with fallback to port 5000 for flexible deployment