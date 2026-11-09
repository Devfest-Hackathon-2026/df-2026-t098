# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

WhyLint uses Angular for its mobile and desktop web experience. The native mobile app is planned as a separate project.

## Users and purpose

Students and early-career developers use WhyLint to understand technology. The core experience is a phone-first, vertically scrolling feed of AI-generated and community questions, shaped by selected interests, programming languages, and frameworks. Learners explain why code and technical concepts work, receive feedback, and retry questions they have not yet understood.

## Constraints

- The team is building WhyLint for the GDGoC Japan DevFest 2026 hackathon.
- The app uses Angular, NestJS, PostgreSQL and TypeORM.
- Japanese is the default interface language; English is also supported.
- Language is selected during onboarding and in signed-in Profile Settings. Account
  preferences restore that choice across devices.
- This checkout extends the existing visual implementation and must preserve its design and behavior.
- Live generation and assessment depend on configured Gemini credentials. Test fixtures stay in the test harness.

## Principles

- Put a learner's own explanation at the center of practice.
- Use skeletons for content loading, with accessible status announcements. Feed
  navigation follows scrolling and keyboard scrolling.
- Make the feed immediate and comfortable on a phone, with desktop as a fallback.
- Be clear about what has and has not been connected or verified.
