# GeoQuest Agent Analysis

This document provides an analysis of the GeoQuest application, a location-based quiz game.

## Application Overview

GeoQuest is a "Tipspromenad" (quiz walk) application that allows users to create, join, and play location-based quizzes. The application is built as a hybrid mobile app using React and Capacitor, with a Firebase backend for data storage, authentication, and serverless functions.

### Core Concepts

- **Runs**: A "run" represents a single quiz walk. Each run has a name, description, a set of questions, and a series of checkpoints on a map.
- **Checkpoints**: These are geographical locations that participants must visit to answer a question.
- **Questions**: Multiple-choice questions are associated with each checkpoint. The app supports questions in multiple languages (Swedish and English).
- **Participants**: Users who join a run to participate in the quiz.
- **User Roles**: The application has different user roles with varying permissions:
    - **Users**: Can join and play runs.
    - **Admins**: Can create and manage "hosted" runs.
    - **SuperUsers**: Have access to all runs, user management, analytics, and other administrative features.

### Key Features

- **Run Creation**:
    - **Generated Runs**: Users can automatically generate a run by specifying parameters like distance, number of questions, and categories. The application then creates a walking route with checkpoints.
    - **Hosted Runs**: Admins can create runs with more control, defining the route and question placement.
- **Gameplay**:
    - **GPS-based**: Participants use their device's GPS to navigate to checkpoints. A question is unlocked when the participant is within a certain proximity (25 meters) of the checkpoint.
    - **Manual Mode**: A manual mode is available for users who want to answer questions without GPS tracking.
- **Real-time Experience**: The application uses React Context (`RunContext`) to provide a real-time view of the game state, including the current question, participant progress, and map updates.
- **Authentication**: Firebase Authentication is used to manage user accounts, including anonymous login for guests.
- **Persistence**: Run and user data is stored in Firestore. The application also uses `localStorage` for caching and storing session-related data like payment status.
- **Monetization**: The app includes a payment system (`paymentService`) to charge users for participating in runs.
- **PWA Support**: The application can be installed as a Progressive Web App (PWA).

## Technical Architecture

- **Frontend**: React, using `react-router-dom` for routing and React Context for state management. The UI is styled with Tailwind CSS.
- **Backend**: Firebase, including:
    - **Firestore**: As the primary database for storing runs, questions, and user data.
    - **Firebase Authentication**: For user management.
    - **Firebase Cloud Functions**: For backend logic, such as AI-powered question generation (`aiQuestionGenerator.js`).
- **Mobile**: Capacitor is used to build and deploy the application as a native mobile app for iOS and Android.
- **Mapping**: The application uses a mapping library (likely Leaflet, based on `RunMap.js`) to display the run route and checkpoints.
- **Services**: The business logic is well-structured into services, gateways, and repositories, handling tasks such as:
    - `runFactory.js`: Creating run objects.
    - `questionService.js`: Managing the question bank.
    - `routeService.js`: Generating walking routes.
    - `firestoreRunGateway.js`: Interacting with the Firestore database for run data.