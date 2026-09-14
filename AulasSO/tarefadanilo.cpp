#include <stdio.h>

// Função 1: recebe as notas
void lerNotas(float *nota1, float *nota2, float *nota3) {
    printf("Digite a primeira nota: ");
    scanf("%f", nota1);

    printf("Digite a segunda nota: ");
    scanf("%f", nota2);

    printf("Digite a terceira nota: ");
    scanf("%f", nota3);
}

// Função 2: calcula e mostra a média
void calcularMedia(float nota1, float nota2, float nota3) {
    float media;

    media = (nota1 + nota2 + nota3) / 3.0;

    printf("\nA media das notas e: %.2f\n", media);
}

int main() {
    float nota1, nota2, nota3;

    lerNotas(&nota1, &nota2, &nota3);

    calcularMedia(nota1, nota2, nota3);

    return 0;
}
