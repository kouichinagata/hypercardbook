<svelte:head>
    <title>Privacy Policy | HyperCardBook and PapeRobo</title>
    <meta name="description" content="How Koichi Nagata handles information in the hosted HyperCardBook and PapeRobo services." />
</svelte:head>

<main lang="en">
    <a href="/">← Back to HyperCardBook</a>
    <h1>Privacy Policy</h1>
    <p><strong>Last updated: October 5, 2026</strong></p>
    <p>This Privacy Policy explains how Koichi Nagata (“we,” “us,” or “our”) handles information when you use the hosted HyperCardBook and PapeRobo services.</p>
    <p>HyperCardBook is an open-source project available to people around the world. This policy covers the services we operate. Independently hosted versions may have different operators and privacy practices.</p>

    <h2>Information We Process</h2>
    <p>Depending on the features you use, we may process:</p>
    <ul>
        <li>Account information provided through your sign-in service, such as your account identifier, email address, and profile information.</li>
        <li>Content you provide, including messages, prompts, books, cards, documents, images, and audio submitted through enabled features.</li>
        <li>Information from Google, Slack, or Notion when you choose to connect those services.</li>
        <li>Technical information needed to operate and troubleshoot the services, such as request metadata and error logs.</li>
        <li>Credentials you provide or authorize, including API keys and external-service access tokens.</li>
    </ul>
    <p>Please avoid submitting personal information that is unnecessary for your intended use.</p>

    <h2>How We Use Information</h2>
    <p>We use information to authenticate users, provide requested features, generate AI responses, save and publish content at your direction, maintain service security, and investigate technical problems.</p>
    <p>We do not sell your personal information or use connected Google user data for advertising.</p>

    <h2>Google Integration</h2>
    <p>If you connect your Google account to PapeRobo, the current integration requests permission to:</p>
    <ul>
        <li>Access and manage calendar events.</li>
        <li>Read and modify Gmail messages.</li>
        <li>View and download Google Drive files.</li>
    </ul>
    <p>These permissions correspond to the <code>calendar.events</code>, <code>gmail.modify</code>, and <code>drive.readonly</code> scopes.</p>
    <p>The current application enables search and retrieval tools for these services. Although the requested Calendar and Gmail permissions include modification capabilities, the configured Google tools are limited to reading and searching.</p>
    <p>Relevant Google information may be retrieved and processed by OpenAI to answer your requests. We do not use connected Google user data to develop, improve, or train generalized AI or machine-learning models.</p>
    <p>Our use and transfer of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including its Limited Use requirements.</p>

    <h2>Slack and Notion Integrations</h2>
    <p>Connecting Slack or Notion allows PapeRobo to retrieve information available to your connected account through the enabled tools. Your account permissions and the external service’s policies determine what information is accessible.</p>
    <p>Retrieved information may be processed by OpenAI to respond to your requests. Enabled actions that send or change external-service content require approval through the application’s confirmation flow.</p>

    <h2>AI and Other Service Providers</h2>
    <p>We use third-party services to provide authentication, hosting, database storage, and AI functionality. These include OpenAI and Supabase, depending on the feature and deployment.</p>
    <p>When you use an AI feature, relevant prompts, conversation context, submitted content, audio or images, and retrieved external-service information may be sent to the providers needed to fulfill your request.</p>
    <p>Provider processing and retention are also governed by their applicable terms, privacy policies, and our service configuration.</p>

    <h2>Public Content and Open Source</h2>
    <p>Books, cards, and other content you publish may become publicly accessible. Others may copy or redistribute publicly available content, and removing it from our service may not remove copies held by others.</p>
    <p>The project’s open-source license governs its source code. It does not automatically make private account information, unpublished content, credentials, or connected-service data public.</p>

    <h2>Storage and Security</h2>
    <p>We use access controls and other safeguards to protect stored information. PapeRobo encrypts stored external-service access and refresh tokens on the server.</p>
    <p>No system can guarantee absolute security.</p>

    <h2>Retention and Deletion</h2>
    <p>Saved account information and content may remain available until deleted through supported features or handled through a deletion request. Retention may also be necessary for service operation, security, or legal obligations.</p>
    <p>Disconnecting an external service from PapeRobo deletes the stored connection credentials. It does not automatically delete previously saved content, revoke permissions at the external service, or remove information already processed by third-party providers.</p>
    <p>You can revoke access separately through your Google, Slack, or Notion account settings. Contact us to request deletion of account information or content that you cannot remove through the application. Backup and provider retention schedules may affect when deletion is completed.</p>

    <h2>Cookies and Browser Storage</h2>
    <p>We use cookies or browser storage where needed for authentication, secure connection flows, and application preferences.</p>

    <h2>International Processing</h2>
    <p>Our service providers may process information in countries other than your country of residence.</p>

    <h2>Your Choices</h2>
    <p>You can choose whether to connect external services, revoke their permissions, disconnect them from PapeRobo, and decide what content to submit or publish.</p>
    <p>Depending on your location, you may have rights concerning access, correction, deletion, restriction, or portability of your personal information. Contact us to make a request.</p>

    <h2>Changes to This Policy</h2>
    <p>We may update this policy as the services evolve. We will publish the revised policy and update its revision date.</p>

    <h2>Contact</h2>
    <p><strong>Operator:</strong> Koichi Nagata<br /><strong>Email:</strong> <a href="mailto:kouichi.nagata@gmail.com">kouichi.nagata@gmail.com</a></p>
</main>

<style>
    main { max-width: 800px; margin: 0 auto; padding: 2rem 1.25rem 4rem; color: #e5e7eb; line-height: 1.75; overflow-wrap: anywhere; }
    h1 { font-size: 2.25rem; line-height: 1.2; margin: 1.5rem 0 1rem; }
    h2 { font-size: 1.4rem; line-height: 1.3; margin: 2rem 0 0.75rem; }
    p, ul { margin: 0 0 1rem; }
    ul { padding-left: 1.5rem; }
    li { margin-bottom: 0.5rem; }
    a { color: #c4b5fd; text-decoration: underline; text-underline-offset: 3px; }
    a:focus-visible { outline: 2px solid currentColor; outline-offset: 4px; }
    code { font-size: 0.9em; }
</style>
