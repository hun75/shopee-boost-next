import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const ADMIN_EMAIL = 'hun7575@naver.com';

// 인증 코드 저장용 (Supabase auth_tokens 테이블 key='password_reset')
async function saveResetCode(code: string) {
  await supabase.from('auth_tokens').upsert({
    key: 'password_reset',
    token_data: { code, email: ADMIN_EMAIL, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() }
  });
}

async function getResetCode(): Promise<{ code: string; expires_at: string } | null> {
  const { data } = await supabase.from('auth_tokens').select('token_data').eq('key', 'password_reset').single();
  return data?.token_data || null;
}

async function clearResetCode() {
  await supabase.from('auth_tokens').delete().eq('key', 'password_reset');
}

// 현재 비밀번호 조회 (Supabase에서)
async function getAdminPassword(): Promise<string> {
  const { data } = await supabase.from('auth_tokens').select('token_data').eq('key', 'admin_credentials').single();
  if (data?.token_data?.password) return data.token_data.password;
  // Supabase에 없으면 환경변수에서 가져옴 (초기 마이그레이션)
  return process.env.ADMIN_PASSWORD || '';
}

async function setAdminPassword(newPassword: string) {
  const { data: existing } = await supabase.from('auth_tokens').select('token_data').eq('key', 'admin_credentials').single();
  await supabase.from('auth_tokens').upsert({
    key: 'admin_credentials',
    token_data: { ...(existing?.token_data || {}), id: process.env.ADMIN_ID || 'hun75', password: newPassword, updated_at: new Date().toISOString() }
  });
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6자리
}

// POST /api/auth/password — 비밀번호 변경 흐름
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'send_code': {
        // 인증 코드 발송
        const code = generateCode();
        await saveResetCode(code);

        // Resend로 이메일 발송
        try {
          if (!process.env.RESEND_API_KEY) {
            return NextResponse.json({ error: '서버 에러: RESEND_API_KEY 환경 변수가 설정되지 않았습니다. 관리자에게 문의하세요.' }, { status: 500 });
          }
          const { Resend } = await import('resend');
          const resend = new Resend(process.env.RESEND_API_KEY);
          const { data, error } = await resend.emails.send({
            from: 'Shopee Agent <onboarding@resend.dev>',
            to: [ADMIN_EMAIL],
            subject: '🔐 Shopee Agent 비밀번호 변경 인증 코드',
            html: `
              <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #EE4D2D;">🔐 비밀번호 변경 인증</h2>
                <p>아래 인증 코드를 입력해주세요:</p>
                <div style="background: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px; margin: 16px 0;">
                  <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #333;">${code}</span>
                </div>
                <p style="color: #999; font-size: 12px;">이 코드는 10분간 유효합니다.</p>
              </div>
            `,
          });
          
          if (error) {
            return NextResponse.json({ error: `Resend 발송 에러: ${error.message}` }, { status: 500 });
          }
        } catch (emailErr: any) {
          return NextResponse.json({ error: `이메일 발송 실패: ${emailErr.message}` }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: `${ADMIN_EMAIL}로 인증 코드를 발송했습니다.` });
      }

      case 'verify_and_change': {
        // 코드 확인 + 비밀번호 변경
        const { code, newPassword } = body;
        if (!code || !newPassword) {
          return NextResponse.json({ error: '코드와 새 비밀번호를 입력해주세요.' }, { status: 400 });
        }
        if (newPassword.length < 6) {
          return NextResponse.json({ error: '비밀번호는 최소 6자 이상이어야 합니다.' }, { status: 400 });
        }

        const saved = await getResetCode();
        if (!saved) {
          return NextResponse.json({ error: '인증 코드가 없습니다. 다시 발송해주세요.' }, { status: 400 });
        }

        // 만료 확인
        if (new Date(saved.expires_at) < new Date()) {
          await clearResetCode();
          return NextResponse.json({ error: '인증 코드가 만료되었습니다. 다시 발송해주세요.' }, { status: 400 });
        }

        // 코드 일치 확인
        if (saved.code !== code) {
          return NextResponse.json({ error: '인증 코드가 일치하지 않습니다.' }, { status: 400 });
        }

        // 비밀번호 변경
        await setAdminPassword(newPassword);
        await clearResetCode();

        return NextResponse.json({ success: true, message: '비밀번호가 변경되었습니다.' });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
