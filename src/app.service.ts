import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return `
      <html>
        <head>
          <title>Server Status</title>
          <style>
            body {
              margin: 0;
              font-family: system-ui, Arial, sans-serif;
              background: #0f172a;
              color: #ffffff;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
            }

            .box {
              text-align: center;
              padding: 30px 40px;
              border-radius: 12px;
              background: #111827;
              box-shadow: 0 8px 25px rgba(0,0,0,0.4);
            }

            h1 {
              margin: 0;
              font-size: 26px;
            }

            p {
              margin-top: 8px;
              color: #9ca3af;
            }
          </style>
        </head>
        <body>
          <div class="box">
            <h1>✅ Server is running!</h1>
            <p>NestJS backend is ready</p>
          </div>
        </body>
      </html>
    `;
  }
}
