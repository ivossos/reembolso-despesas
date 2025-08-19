#!/usr/bin/env python3
"""
Receipt Image Generator
Creates sample receipt images for testing the expense system
"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_receipt_image(text, filename, width=400, height=600):
    """Create a receipt image from text"""
    
    # Create a new image with white background
    img = Image.new('RGB', (width, height), color='white')
    draw = ImageDraw.Draw(img)
    
    # Try to use a default font, fallback to basic if not available
    try:
        # Try to use a system font
        font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 12)
    except:
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 12)
        except:
            # Use default font
            font = ImageFont.load_default()
    
    # Split text into lines
    lines = text.strip().split('\n')
    
    # Calculate line height
    line_height = font.getbbox('A')[3] + 2
    
    # Start position
    x, y = 20, 20
    
    # Draw each line
    for line in lines:
        if line.strip():  # Skip empty lines
            # Draw the line
            draw.text((x, y), line.strip(), fill='black', font=font)
            y += line_height
            
            # Add some spacing for separator lines
            if line.startswith('='):
                y += 5
    
    # Save the image
    img.save(filename, 'JPEG', quality=95)
    print(f"Created: {filename}")

def main():
    """Main function to create all receipt images"""
    
    # Restaurant receipt
    `\\\\staurant_text = """==========================================
        RESTAURANTE BRASILEIRO
==========================================
Rua das Flores, 123 - Centro
São Paulo, SP - CEP: 01234-567
CNPJ: 12.345.678/0001-90
==========================================
Data: 15/01/2025
Hora: 12:30
Ticket: #001234
==========================================
ITEM                    QTD    VALOR
------------------------------------------
Prato Feito            1      R$ 25,90
Refrigerante           1      R$  8,50
Sobremesa              1      R$ 11,40
------------------------------------------
SUBTOTAL:                        R$ 45,80
IMPOSTOS:                        R$  4,58
==========================================
TOTAL:                           R$ 50,38
==========================================
FORMA DE PAGAMENTO: Cartão de Crédito
==========================================
Obrigado pela preferência!
Volte sempre!
=========================================="""
    
    # Uber receipt
    uber_text = """==========================================
              UBER
==========================================
Viagem #UBER-2025-001234
Data: 16/01/2025
Hora: 14:15
==========================================
MOTORISTA: João Silva
VEÍCULO: Toyota Corolla - ABC-1234
==========================================
ORIGEM: Rua das Flores, 123
         São Paulo, SP
DESTINO: Av. Paulista, 1000
          São Paulo, SP
==========================================
DISTÂNCIA: 8.5 km
TEMPO: 18 minutos
==========================================
TARIFA BASE:           R$ 8,50
TARIFA POR KM:         R$ 2,50
TARIFA POR MINUTO:     R$ 0,30
==========================================
SUBTOTAL:              R$ 32,50
==========================================
FORMA DE PAGAMENTO: Cartão de Crédito
==========================================
Obrigado por usar o Uber!
=========================================="""
    
    # Office supplies receipt
    office_text = """==========================================
        PAPELARIA CENTRAL
==========================================
Av. das Indústrias, 500 - Zona Industrial
São Paulo, SP - CEP: 04567-890
CNPJ: 98.765.432/0001-10
==========================================
Data: 17/01/2025
Hora: 09:45
Ticket: #OFF-567890
==========================================
ITEM                    QTD    VALOR
------------------------------------------
Caderno A4 (100 folhas) 10     R$ 45,00
Caneta Esferográfica    20     R$ 32,00
Grampeador              1      R$ 28,90
Clipes de Papel         2      R$ 22,00
------------------------------------------
SUBTOTAL:                        R$ 127,90
==========================================
FORMA DE PAGAMENTO: Cartão de Débito
==========================================
Obrigado pela compra!
=========================================="""
    
    # Create the images
    create_receipt_image(restaurant_text, "restaurant-receipt.jpg")
    create_receipt_image(uber_text, "uber-receipt.jpg")
    create_receipt_image(office_text, "office-supplies-receipt.jpg")
    
    print("\nAll receipt images created successfully!")
    print("You can now use these .jpg files to test the receipt upload functionality.")

if __name__ == "__main__":
    main()
