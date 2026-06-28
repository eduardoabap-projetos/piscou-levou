import { v2 as cloudinary } from 'npm:cloudinary@1.41.0';

cloudinary.config({
  cloud_name: 'do7dl1bhc',
  api_key: '951885926295627',
  api_secret: 'pRKh3I9_FS8_rUOqg_4om2JiHjo'
});

async function run() {
  try {
    console.log("Fazendo upload da imagem pro Cloudinary...");
    // Simulando a imagem de feed que já geramos
    const imageUrl = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';
    
    const result = await cloudinary.uploader.upload(imageUrl, {
      resource_type: 'image'
    });
    console.log("Upload concluído! Public ID:", result.public_id);

    // Gerando URL do vídeo Reel com Ken Burns (zoompan)
    const reelUrl = cloudinary.url(result.public_id, {
      resource_type: 'video', // Pede como vídeo!
      format: 'mp4',
      transformation: [
        { effect: "zoompan", duration: 15000 } // zoom suave de 15 segundos
      ]
    });

    console.log("\n🎬 URL do Reel Gerado:");
    console.log(reelUrl);
  } catch (err) {
    console.error("Erro:", err);
  }
}

run();
