<script lang="ts">
    import { createBrowserClient } from '@supabase/ssr';
    import { env } from '$env/dynamic/public';

    const supabase = createBrowserClient(
        env.PUBLIC_SUPABASE_URL || '',
        env.PUBLIC_SUPABASE_ANON_KEY || ''
    );

    let email = $state('');
    let password = $state('');
    let errorMessage = $state('');
    let successMessage = $state('');
    let loading = $state(false);

    async function loginWithGoogle() {
        loading = true;
        errorMessage = '';
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`
            }
        });
        if (error) {
            errorMessage = error.message;
            loading = false;
        }
    }

    async function handleEmailLogin(e: Event) {
        e.preventDefault();
        loading = true;
        errorMessage = '';
        successMessage = '';
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            errorMessage = error.message;
            loading = false;
        } else {
            window.location.href = '/';
        }
    }

    async function handleEmailSignUp(e: Event) {
        e.preventDefault();
        loading = true;
        errorMessage = '';
        successMessage = '';
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
            errorMessage = error.message;
        } else {
            successMessage = '登録確認メールを送信しました。メールフォルダを確認してログインしてください。';
        }
        loading = false;
    }
</script>

<div class="login-container">
    <div class="login-panel">
        <h1 class="title">HyperCardBook</h1>
        <p class="subtitle">ログインして電子書籍の生成を開始</p>

        {#if errorMessage}
            <div class="message error-message">
                ⚠️ {errorMessage}
            </div>
        {/if}

        {#if successMessage}
            <div class="message success-message">
                ✉️ {successMessage}
            </div>
        {/if}

        <!-- Google Login Button -->
        <button class="google-btn" onclick={loginWithGoogle} disabled={loading}>
            <svg class="google-icon" viewBox="0 0 24 24" width="20" height="20">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 6.31l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Googleでログイン
        </button>

        <div class="divider">
            <span>または</span>
        </div>

        <!-- Email/Password Login Form -->
        <form class="email-form">
            <div class="input-group">
                <label for="email">メールアドレス</label>
                <input type="email" id="email" bind:value={email} required placeholder="email@example.com" disabled={loading} />
            </div>

            <div class="input-group">
                <label for="password">パスワード</label>
                <input type="password" id="password" bind:value={password} required placeholder="••••••••" disabled={loading} />
            </div>

            <div class="btn-group">
                <button type="submit" class="submit-btn login-btn" onclick={handleEmailLogin} disabled={loading || !email || !password}>
                    ログイン
                </button>
                <button type="button" class="submit-btn signup-btn" onclick={handleEmailSignUp} disabled={loading || !email || !password}>
                    新規登録
                </button>
            </div>
        </form>
    </div>
</div>

<style>
    .login-container {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100vw;
        height: 100vh;
        background-color: #0b0c10;
        box-sizing: border-box;
    }

    .login-panel {
        width: 90%;
        max-width: 400px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        padding: 40px 30px;
        border-radius: 16px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
        text-align: center;
        box-sizing: border-box;
    }

    .title {
        font-family: 'Outfit', sans-serif;
        font-size: 30px;
        font-weight: 800;
        letter-spacing: -0.02em;
        margin: 0 0 8px 0;
        color: #f5ebe0;
    }

    .subtitle {
        font-size: 13px;
        color: #f5ebe0;
        opacity: 0.6;
        margin: 0 0 30px 0;
    }

    .message {
        padding: 10px 12px;
        border-radius: 8px;
        font-size: 13px;
        line-height: 1.4;
        text-align: left;
        margin-bottom: 20px;
    }

    .error-message {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        color: #fca5a5;
    }

    .success-message {
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.2);
        color: #a7f3d0;
    }

    .google-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 46px;
        background: #ffffff;
        border: none;
        border-radius: 8px;
        color: #1f2937;
        font-family: system-ui, sans-serif;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s, transform 0.1s;
        gap: 12px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .google-btn:hover:not(:disabled) {
        background: #f3f4f6;
    }

    .google-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }

    .google-icon {
        flex-shrink: 0;
    }

    .divider {
        display: flex;
        align-items: center;
        margin: 24px 0;
        color: #f5ebe0;
        opacity: 0.3;
        font-size: 12px;
    }

    .divider::before, .divider::after {
        content: "";
        flex: 1;
        height: 1px;
        background: #f5ebe0;
        opacity: 0.2;
    }

    .divider span {
        padding: 0 10px;
    }

    .email-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
        text-align: left;
    }

    .input-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .input-group label {
        font-size: 12px;
        color: #f5ebe0;
        opacity: 0.8;
    }

    .input-group input {
        width: 100%;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 12px 14px;
        color: #ffffff;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
        box-sizing: border-box;
    }

    .input-group input:focus {
        border-color: #8b5cf6;
    }

    .btn-group {
        display: flex;
        gap: 10px;
        margin-top: 8px;
    }

    .submit-btn {
        flex: 1;
        height: 42px;
        border-radius: 8px;
        border: none;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    .login-btn {
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        color: #ffffff;
    }

    .login-btn:hover:not(:disabled) {
        filter: brightness(1.1);
    }

    .signup-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #f5ebe0;
    }

    .signup-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.1);
    }

    .submit-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
</style>
